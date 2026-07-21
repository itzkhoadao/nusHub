import { apiUrl } from "./api";
import { getAuthToken } from "./authStorage";

export const MAX_POST_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_POST_ATTACHMENTS = 5;

type PresignedPostAttachmentUpload = {
  client_id: string;
  file_size: number;
  file_url: string;
  mime_type: string;
  original_name: string;
  storage_key: string;
  upload_url: string;
};

export type UploadedPostAttachment = {
  file_size: number;
  file_url: string;
  mime_type: string;
  original_name: string;
  storage_key: string;
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

async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Post request failed");
  }

  return data;
}

// asks backend to generate temp R2 upload URL
async function createPostAttachmentUploadUrls(files: File[]) {
  const response = await fetch(apiUrl("/api/posts/attachments/presign"), {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      files: files.map((file, index) => ({
        client_id: String(index),
        file_size: file.size,
        mime_type: file.type || "application/octet-stream",
        original_name: file.name,
      })),
    }),
  });

  return readJsonResponse<{ uploads: PresignedPostAttachmentUpload[] }>(
    response,
  );
}

async function uploadFileToR2(
  upload: PresignedPostAttachmentUpload,
  file: File,
) {
  const response = await fetch(upload.upload_url, {
    body: file,
    headers: {
      "Content-Type": upload.mime_type,
    },
    method: "PUT",
  });

  if (!response.ok) {
    throw new Error(`Failed to upload ${file.name}`);
  }
}

// check if a file to be uploaded is valid
export function validatePostAttachments(files: File[]) {
  if (files.length > MAX_POST_ATTACHMENTS) {
    throw new Error("You can attach up to 5 files");
  }

  const oversizedFile = files.find(
    (file) => file.size > MAX_POST_ATTACHMENT_SIZE_BYTES,
  );

  if (oversizedFile) {
    throw new Error(`${oversizedFile.name} is bigger than 10 MB`);
  }
}

export async function uploadPostAttachments(files: File[]) {
  validatePostAttachments(files);

  if (files.length === 0) {
    return [];
  }

  // asks backend for temp R2 upload URLs
  const { uploads } = await createPostAttachmentUploadUrls(files);

  // browser uploads each file to R2
  await Promise.all(
    uploads.map((upload) => {
      const file = files[Number(upload.client_id)];
      return uploadFileToR2(upload, file);
    }),
  );

  return uploads.map(
    (upload): UploadedPostAttachment => ({
      file_size: upload.file_size,
      file_url: upload.file_url,
      mime_type: upload.mime_type,
      original_name: upload.original_name,
      storage_key: upload.storage_key,
    }),
  );
}
