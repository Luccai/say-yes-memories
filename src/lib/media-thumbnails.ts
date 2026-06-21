const THUMBNAIL_SIZE = 512;
const THUMBNAIL_MAX_BYTES = 760 * 1024;
const THUMBNAIL_START_QUALITY = 0.82;
const THUMBNAIL_MIN_QUALITY = 0.48;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Thumbnail could not be created."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

function drawCover(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Thumbnail creation is not supported in this browser.");
  }

  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = 1;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let cropX = 0;
  let cropY = 0;

  if (sourceRatio > targetRatio) {
    cropWidth = sourceHeight * targetRatio;
    cropX = (sourceWidth - cropWidth) / 2;
  } else {
    cropHeight = sourceWidth / targetRatio;
    cropY = (sourceHeight - cropHeight) / 2;
  }

  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  context.fillStyle = "#f1e6d8";
  context.fillRect(0, 0, THUMBNAIL_SIZE, THUMBNAIL_SIZE);
  context.drawImage(
    source,
    cropX,
    cropY,
    cropWidth,
    cropHeight,
    0,
    0,
    THUMBNAIL_SIZE,
    THUMBNAIL_SIZE,
  );

  return canvas;
}

async function fileFromCanvas(canvas: HTMLCanvasElement, fileName: string) {
  let quality = THUMBNAIL_START_QUALITY;
  let blob = await canvasToBlob(canvas, quality);

  while (blob.size > THUMBNAIL_MAX_BYTES && quality > THUMBNAIL_MIN_QUALITY) {
    quality -= 0.08;
    blob = await canvasToBlob(canvas, quality);
  }

  if (blob.size > THUMBNAIL_MAX_BYTES) {
    return null;
  }

  const baseName = fileName.replace(/\.[^.]+$/, "") || "memory";

  return new File([blob], `${baseName}-thumbnail.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

async function createImageThumbnail(file: File) {
  if ("createImageBitmap" in window) {
    const bitmap = await createImageBitmap(file);
    const canvas = drawCover(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    return fileFromCanvas(canvas, file.name);
  }

  return new Promise<File | null>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      fileFromCanvas(drawCover(image, image.naturalWidth, image.naturalHeight), file.name)
        .then(resolve)
        .catch(reject);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Image thumbnail could not be created."));
    };
    image.src = url;
  });
}

function waitForVideoEvent(video: HTMLVideoElement, eventName: "loadedmetadata" | "loadeddata" | "seeked") {
  return new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("Video thumbnail timed out."));
    }, 4500);
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("Video thumbnail could not be created."));
    };
    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
    };

    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

async function createVideoThumbnail(file: File) {
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");

  try {
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.src = url;
    await waitForVideoEvent(video, "loadedmetadata");

    if (Number.isFinite(video.duration) && video.duration > 0.8) {
      video.currentTime = Math.min(0.8, video.duration / 3);
      await waitForVideoEvent(video, "seeked");
    } else if (video.readyState < 2) {
      await waitForVideoEvent(video, "loadeddata");
    }

    if (!video.videoWidth || !video.videoHeight) {
      return null;
    }

    const canvas = drawCover(video, video.videoWidth, video.videoHeight);
    return fileFromCanvas(canvas, file.name);
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}

export async function createMediaThumbnail(file: File) {
  try {
    if (file.type.startsWith("image/")) {
      return createImageThumbnail(file);
    }

    if (file.type.startsWith("video/")) {
      return createVideoThumbnail(file);
    }
  } catch {
    return null;
  }

  return null;
}
