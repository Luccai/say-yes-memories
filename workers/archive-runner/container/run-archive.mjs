import { createHmac } from "node:crypto";
import { PassThrough, Transform } from "node:stream";
import archiver from "archiver";
import { GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

const requiredEnv = [
  "ARCHIVE_JOB_ID",
  "ARCHIVE_WEDDING_ID",
  "ARCHIVE_FILE_NAME",
  "ARCHIVE_OUTPUT_PATH",
  "ARCHIVE_API_BASE_URL",
  "ARCHIVE_CALLBACK_SECRET",
  "ARCHIVE_ATTEMPT_ID",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
];

for (const key of requiredEnv) {
  if (!process.env[key]) throw new Error(`Missing ${key}.`);
}

const config = Object.fromEntries(requiredEnv.map((key) => [key, process.env[key]]));
if (Buffer.byteLength(config.ARCHIVE_CALLBACK_SECRET, "utf8") < 32) {
  throw new Error("Archive callback secret is too short.");
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${config.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.R2_ACCESS_KEY_ID,
    secretAccessKey: config.R2_SECRET_ACCESS_KEY,
  },
});

function canonicalRequest({ timestamp, method, path, body }) {
  return [timestamp, method.toUpperCase(), path, body].join("\n");
}

function signedHeaders({ timestamp, method, path, body }) {
  const signature = createHmac("sha256", config.ARCHIVE_CALLBACK_SECRET)
    .update(canonicalRequest({ timestamp, method, path, body }), "utf8")
    .digest("hex");
  return {
    "content-type": "application/json",
    "x-archive-timestamp": timestamp,
    "x-archive-signature": signature,
    "x-archive-attempt": config.ARCHIVE_ATTEMPT_ID,
  };
}

async function callback(path, body, method = "POST") {
  const target = new URL(path, config.ARCHIVE_API_BASE_URL);
  const rawBody = method === "GET" ? "" : JSON.stringify(body ?? {});
  const response = await fetch(target, {
    method,
    headers: signedHeaders({
      timestamp: String(Date.now()),
      method,
      path: target.pathname,
      body: rawBody,
    }),
    body: method === "GET" ? undefined : rawBody,
  });
  if (!response.ok) {
    throw new Error(`Archive callback failed with ${response.status}.`);
  }
  return response.json();
}

function archiveFolder(kind) {
  if (kind === "image") return "Photos";
  if (kind === "video") return "Videos";
  return "Voice Notes";
}

function safeFileName(value, ordinal) {
  const base = String(value || "memory")
    .replace(/[\\/\u0000-\u001f<>:"|?*]+/g, "-")
    .replace(/^[-.\s]+|[-.\s]+$/g, "")
    .slice(0, 180) || "memory";
  return `${String(ordinal).padStart(4, "0")}-${base}`;
}

function csvField(value) {
  const source = String(value ?? "");
  const normalized = /^[\u0000-\u0020]*[=+\-@]/.test(source) ? `'${source}` : source;
  return /[",\r\n]/.test(normalized)
    ? `"${normalized.replaceAll('"', '""')}"`
    : normalized;
}

function messagesCsv(items) {
  const rows = ["folder,file_name,uploaded_at,guest_name,message"];
  for (const item of items) {
    rows.push(
      [archiveFolder(item.kind), item.fileName, item.createdAt, item.guestName, item.note ?? ""]
        .map(csvField)
        .join(","),
    );
  }
  return `${rows.join("\n")}\n`;
}

function appendStream(archive, stream, name) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    const onEntry = (entry) => {
      if (entry.name !== name) return;
      archive.off("error", onError);
      archive.off("entry", onEntry);
      resolve();
    };
    archive.once("error", onError);
    archive.on("entry", onEntry);
    archive.append(stream, { name, date: new Date() });
  });
}

async function run() {
  const manifest = await callback(
    `/api/internal/archives/${config.ARCHIVE_JOB_ID}/manifest`,
    undefined,
    "GET",
  );
  if (manifest.job.archivePath !== config.ARCHIVE_OUTPUT_PATH) {
    throw new Error("Archive destination was rejected.");
  }

  const zip = archiver("zip", { forceZip64: true, store: true });
  const output = new PassThrough();
  let zipError = null;
  zip.on("error", (error) => {
    zipError = error;
  });
  zip.pipe(output);
  const upload = new Upload({
    client: r2,
    params: {
      Bucket: config.R2_BUCKET,
      Key: config.ARCHIVE_OUTPUT_PATH,
      Body: output,
      ContentType: "application/zip",
      ContentDisposition: `attachment; filename="${config.ARCHIVE_FILE_NAME.replace(/"/g, "")}"`,
    },
    queueSize: 3,
    partSize: 64 * 1024 * 1024,
    leavePartsOnError: false,
  });
  const uploadDone = upload.done();
  let processedFiles = 0;
  let processedBytes = 0;

  for (const item of manifest.items) {
    const object = await r2.send(
      new GetObjectCommand({ Bucket: config.R2_BUCKET, Key: item.storagePath }),
    );
    if (!object.Body) throw new Error("Archive source object is missing.");

    let measuredBytes = 0;
    const meter = new Transform({
      transform(chunk, _encoding, done) {
        measuredBytes += chunk.length;
        done(null, chunk);
      },
    });
    object.Body.pipe(meter);
    const name = `${archiveFolder(item.kind)}/${safeFileName(item.fileName, item.ordinal)}`;
    await appendStream(zip, meter, name);
    if (zipError) throw zipError;
    if (measuredBytes !== item.byteSize) {
      throw new Error("Archive source size changed during preparation.");
    }
    processedFiles += 1;
    processedBytes += measuredBytes;
    await callback(`/api/internal/archives/${config.ARCHIVE_JOB_ID}/progress`, {
      preparedMediaCount: processedFiles,
      preparedSourceBytes: processedBytes,
    });
  }

  zip.append(messagesCsv(manifest.items), { name: "messages.csv", date: new Date() });
  await zip.finalize();
  if (zipError) throw zipError;
  await uploadDone;
  if (zipError) throw zipError;
  const outputHead = await r2.send(
    new HeadObjectCommand({ Bucket: config.R2_BUCKET, Key: config.ARCHIVE_OUTPUT_PATH }),
  );
  const archiveByteSize = Number(outputHead.ContentLength ?? 0);
  if (!Number.isSafeInteger(archiveByteSize) || archiveByteSize < 0) {
    throw new Error("Archive output size is invalid.");
  }
  await callback(`/api/internal/archives/${config.ARCHIVE_JOB_ID}/complete`, {
    archivePath: config.ARCHIVE_OUTPUT_PATH,
    archiveFileName: config.ARCHIVE_FILE_NAME,
    archiveByteSize,
  });
}

run().catch(async (error) => {
  const errorCode = error instanceof Error && error.message.includes("source")
    ? "ARCHIVE_SOURCE_UNAVAILABLE"
    : "ARCHIVE_BUILD_FAILED";
  try {
    await callback(`/api/internal/archives/${config.ARCHIVE_JOB_ID}/fail`, {
      errorCode,
    });
  } catch {
    // The Container wrapper retries the fail callback if this process exits non-zero.
  }
  process.exitCode = 1;
});
