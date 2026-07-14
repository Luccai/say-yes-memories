const PROFILE_PHOTO_MAX_BYTES = 500 * 1024;
const PROFILE_PHOTO_MAX_DIMENSION = 1280;
const PROFILE_PHOTO_START_QUALITY = 0.82;
const PROFILE_PHOTO_MIN_QUALITY = 0.46;

async function loadProfileImageSource(
  file: File,
): Promise<CanvasImageSource & { width: number; height: number }> {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file);
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Selected photo could not be read."));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Selected photo could not be compressed."));
          return;
        }

        resolve(blob);
      },
      "image/jpeg",
      quality,
    );
  });
}

async function renderProfilePhoto(
  source: CanvasImageSource,
  width: number,
  height: number,
  quality: number,
) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Photo compression is not supported in this browser.");
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#fffaf3";
  context.fillRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);

  return canvasToBlob(canvas, quality);
}

export async function compressProfilePhoto(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only profile photos are supported.");
  }

  const source = await loadProfileImageSource(file);
  const largestSide = Math.max(source.width, source.height);
  const scale = Math.min(1, PROFILE_PHOTO_MAX_DIMENSION / largestSide);
  let width = Math.max(1, Math.round(source.width * scale));
  let height = Math.max(1, Math.round(source.height * scale));
  let quality = PROFILE_PHOTO_START_QUALITY;
  let blob = await renderProfilePhoto(source, width, height, quality);

  for (
    let attempt = 0;
    blob.size > PROFILE_PHOTO_MAX_BYTES && attempt < 14;
    attempt += 1
  ) {
    if (quality > PROFILE_PHOTO_MIN_QUALITY) {
      quality = Math.max(PROFILE_PHOTO_MIN_QUALITY, quality - 0.08);
    } else {
      width = Math.max(1, Math.round(width * 0.84));
      height = Math.max(1, Math.round(height * 0.84));
      quality = 0.72;
    }

    blob = await renderProfilePhoto(source, width, height, quality);
  }

  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close();
  }

  if (blob.size > PROFILE_PHOTO_MAX_BYTES) {
    throw new Error("Photo could not be compressed below 500 KB.");
  }

  const baseName = file.name.replace(/\.[^.]+$/, "") || "profile-photo";

  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}
