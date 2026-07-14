import { randomUUID } from "crypto";
import path from "path";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;

export const ALLOWED_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
]);

type UploadInput = {
  conversationId: string;
  originalName: string;
  mimeType: string;
};

let r2Client: S3Client | null = null;

// prevents the app from running with missing config
function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured`);
  }

  return value;
}

function getR2Client() {
  if (r2Client) {
    return r2Client;
  }

  const accountId = requireEnv("R2_ACCOUNT_ID");

  r2Client = new S3Client({
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
  });

  return r2Client;
}

export function getR2BucketName() {
  return requireEnv("R2_BUCKET_NAME");
}

// checks filename, size, and MIME type validity
export function validateAttachmentMetadata(file: {
  file_size: number;
  mime_type: string;
  original_name: string;
}) {
  if (!file.original_name.trim()) {
    throw new Error("File name is required");
  }

  if (file.file_size > MAX_ATTACHMENT_SIZE_BYTES) {
    throw new Error("Each file must be 10 MB or smaller");
  }

  if (!ALLOWED_ATTACHMENT_TYPES.has(file.mime_type)) {
    throw new Error("This file type is not supported");
  }
}

export function createStorageKey({
  conversationId,
  originalName,
}: UploadInput) {
  const extension = path.extname(originalName).toLowerCase();
  return `chat/${conversationId}/${randomUUID()}${extension}`; // prevents filename collisions
}

export function getPublicFileUrl(storageKey: string) {
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL;

  if (!publicBaseUrl) {
    return "";
  }

  return `${publicBaseUrl.replace(/\/$/, "")}/${storageKey}`;
}

export async function createUploadUrl({
  conversationId,
  mimeType,
  originalName,
}: UploadInput) {
  const storageKey = createStorageKey({
    conversationId,
    mimeType,
    originalName,
  });

  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: getR2BucketName(), // config, stored in .env
      ContentType: mimeType,
      Key: storageKey,
    }),
    { expiresIn: 10 * 60 },
  ); // main signing operation, creates a URL with temporary authorization

  return {
    fileUrl: getPublicFileUrl(storageKey),
    storageKey,
    uploadUrl,
  };
}

// for frontend to send with messages
export async function createDownloadUrl(storageKey: string) {
  const publicUrl = getPublicFileUrl(storageKey);

  if (publicUrl) {
    return publicUrl;
  }

  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({
      Bucket: getR2BucketName(),
      Key: storageKey,
    }),
    { expiresIn: 60 * 60 },
  );
}

// verifying uploaded R2 object
export async function verifyUploadedObject({
  fileSize,
  mimeType,
  storageKey,
}: {
  fileSize: number;
  mimeType: string;
  storageKey: string;
}) {
  const object = await getR2Client().send(
    new HeadObjectCommand({
      Bucket: getR2BucketName(),
      Key: storageKey,
    }),
  );

  // checks that the metadata sent to server matches object stored in R2
  if (object.ContentLength !== fileSize) {
    throw new Error("Uploaded file size does not match");
  }

  if (object.ContentType && object.ContentType !== mimeType) {
    throw new Error("Uploaded file type does not match");
  }
}
