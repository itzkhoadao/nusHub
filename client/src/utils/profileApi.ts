import { apiUrl } from "./api";
import { getAuthToken } from "./authStorage";

const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
const MAX_AVATAR_DIMENSION = 512;
const AVATAR_CACHE_CONTROL = "public, max-age=31536000, immutable";
const ALLOWED_AVATAR_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const OPTIMIZED_AVATAR_TYPE = "image/webp";
const OPTIMIZED_AVATAR_QUALITY = 0.82;

type AvatarUpload = {
  file_size: number;
  file_url: string;
  mime_type: string;
  original_name: string;
  storage_key: string;
  upload_url: string;
};

function getAuthHeaders() {
  const token = getAuthToken();

  if (!token) {
    throw new Error("You must be logged in");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

// convert response into JSON, check if HTTP request succeeded
async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Profile request failed");
  }

  return data;
}

// AVATAR IMAGE UPLOAD FLOW:
// Original image file → draw resized image onto canvas → convert canvas image into WEBP Blob object
// → wrap Blob inside a new file → upload that file

// initial client-side check: rejects invalid input before doing processing/network requests
export function validateAvatarFile(file: File) {
  if (file.size > MAX_AVATAR_SIZE_BYTES) {
    throw new Error("Avatar must be 5 MB or smaller");
  }

  if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
    throw new Error("Avatar must be a JPEG, PNG, or WEBP image");
  }
}

function createOptimizedAvatarName(fileName: string) {
  const baseName = fileName.replace(/\.[^/.]+$/, "") || "avatar";
  return `${baseName}-avatar.webp`;
}

async function loadImage(file: File) {
  const objectUrl = URL.createObjectURL(file); // creates a temporary browser URL for local file

  try {
    // creates an in-memory <img>, points it at the temporary URL
    const image = new Image();
    image.decoding = "async";
    image.src = objectUrl;

    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

// convert drawn canvas to Blob object
async function canvasToBlob(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, OPTIMIZED_AVATAR_TYPE, OPTIMIZED_AVATAR_QUALITY);
  });

  if (!blob) {
    throw new Error("Failed to optimize avatar");
  }

  return blob;
}

async function optimizeAvatarFile(file: File) {
  const image = await loadImage(file); // first, load the original image
  const scale = Math.min(
    1,
    MAX_AVATAR_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight),
  ); // calculate resize scale

  // calculate final dimensions
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));

  const canvas = document.createElement("canvas"); // temporary image-processing surface
  const context = canvas.getContext("2d"); // 2D drawing context

  if (!context) {
    throw new Error("Failed to prepare avatar optimizer");
  }

  canvas.width = width;
  canvas.height = height;
  context.drawImage(image, 0, 0, width, height); // draw original image on canvas

  const blob = await canvasToBlob(canvas); // convert to Blob
  return new File([blob], createOptimizedAvatarName(file.name), {
    lastModified: Date.now(),
    type: OPTIMIZED_AVATAR_TYPE,
  }); // convert Blob into File object
}

// FULL AVATAR UPDATE FLOW
export async function updateProfileAvatar(file: File) {
  validateAvatarFile(file);
  const uploadFile = await optimizeAvatarFile(file); // file to be uploaded

  // request a presigned upload URL
  const presignResponse = await fetch(apiUrl("/api/users/me/avatar/presign"), {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_size: uploadFile.size,
      mime_type: uploadFile.type,
      original_name: uploadFile.name,
    }),
  });
  const upload = await readJsonResponse<AvatarUpload>(presignResponse); // data to be uploaded

  const uploadResponse = await fetch(upload.upload_url, {
    method: "PUT",
    headers: {
      "Cache-Control": AVATAR_CACHE_CONTROL,
      "Content-Type": upload.mime_type,
    },
    body: uploadFile,
  }); // upload directly to R2

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload avatar");
  }

  // asks backend to confirm/validate
  const confirmResponse = await fetch(apiUrl("/api/users/me/avatar/confirm"), {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file_size: upload.file_size,
      mime_type: upload.mime_type,
      original_name: upload.original_name,
      storage_key: upload.storage_key,
    }),
  });

  return readJsonResponse<{ user: unknown }>(confirmResponse);
}

export async function removeProfileAvatar() {
  const response = await fetch(apiUrl("/api/users/me/avatar"), {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  return readJsonResponse<{ user: unknown }>(response);
}
