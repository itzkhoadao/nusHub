import { randomUUID } from "crypto";
import path from "path";
import {
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_COVER_SIZE_BYTES = 8 * 1024 * 1024;
export const AVATAR_CACHE_CONTROL = "public, max-age=31536000, immutable";
export const COVER_CACHE_CONTROL = AVATAR_CACHE_CONTROL;

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

export const ALLOWED_AVATAR_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const ALLOWED_COVER_TYPES = ALLOWED_AVATAR_TYPES;

type UploadInput = {
  conversationId: string;
  originalName: string;
  mimeType: string;
};

type PostAttachmentUploadInput = {
  originalName: string;
  mimeType: string;
  userId: string;
};

type AvatarUploadInput = {
  originalName: string;
  mimeType: string;
  userId: string;
};

type CoverUploadInput = AvatarUploadInput;

let r2Client: S3Client | null = null;

function requireR2Configuration() {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET_NAME
  ) {
    throw new Error("Cloudflare R2 storage is not configured");
  }

  return {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    accountId: env.R2_ACCOUNT_ID,
    bucketName: env.R2_BUCKET_NAME,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  };
}

function getR2Client() {
  if (r2Client) {
    return r2Client;
  }

  const r2 = requireR2Configuration();

  r2Client = new S3Client({
    credentials: {
      accessKeyId: r2.accessKeyId,
      secretAccessKey: r2.secretAccessKey,
    },
    endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
    region: "auto",
  });

  return r2Client;
}

export function getR2BucketName() {
  return requireR2Configuration().bucketName;
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

// checks the metadata supplied by frontend
// performed twice: before generating upload URL and after upload, before confirming
export function validateAvatarMetadata(file: {
  file_size: number;
  mime_type: string;
  original_name: string;
}) {
  if (!file.original_name.trim()) {
    throw new Error("File name is required");
  }

  if (file.file_size > MAX_AVATAR_SIZE_BYTES) {
    throw new Error("Avatar must be 5 MB or smaller");
  }

  if (!ALLOWED_AVATAR_TYPES.has(file.mime_type)) {
    throw new Error("Avatar must be a JPEG, PNG, or WEBP image");
  }
}

export function validateCoverMetadata(file: {
  file_size: number;
  mime_type: string;
  original_name: string;
}) {
  if (!file.original_name.trim()) {
    throw new Error("File name is required");
  }

  if (file.file_size > MAX_COVER_SIZE_BYTES) {
    throw new Error("Cover picture must be 8 MB or smaller");
  }

  if (!ALLOWED_COVER_TYPES.has(file.mime_type)) {
    throw new Error("Cover picture must be a JPEG, PNG, or WEBP image");
  }
}

export function createStorageKey({
  conversationId,
  originalName,
}: UploadInput) {
  const extension = path.extname(originalName).toLowerCase();
  return `chat/${conversationId}/${randomUUID()}${extension}`; // prevents filename collisions
}

export function createPostAttachmentStorageKey({
  originalName,
  userId,
}: PostAttachmentUploadInput) {
  const extension = path.extname(originalName).toLowerCase();
  return `posts/${userId}/${randomUUID()}${extension}`; // prevents filename collisions
}

export function createAvatarStorageKey({
  originalName,
  userId,
}: AvatarUploadInput) {
  const extension = path.extname(originalName).toLowerCase();
  return `avatars/${userId}/${randomUUID()}${extension}`; // randomUUID: prevents filename collisions
}

export function createCoverStorageKey({
  originalName,
  userId,
}: CoverUploadInput) {
  const extension = path.extname(originalName).toLowerCase();
  return `covers/${userId}/${randomUUID()}${extension}`;
}

export function getPublicFileUrl(storageKey: string) {
  const publicBaseUrl = env.R2_PUBLIC_BASE_URL;

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

export async function createPostAttachmentUploadUrl({
  mimeType,
  originalName,
  userId,
}: PostAttachmentUploadInput) {
  const storageKey = createPostAttachmentStorageKey({
    mimeType,
    originalName,
    userId,
  });

  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      ContentType: mimeType,
      Key: storageKey,
    }),
    { expiresIn: 10 * 60 },
  ); // uploadUrl: gives browser temp permission to upload to R2

  return {
    fileUrl: getPublicFileUrl(storageKey),
    storageKey,
    uploadUrl,
  };
}

export async function createAvatarUploadUrl({
  mimeType,
  originalName,
  userId,
}: AvatarUploadInput) {
  const storageKey = createAvatarStorageKey({
    mimeType,
    originalName,
    userId,
  }); // create key first (permanent identifier inside R2)

  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      CacheControl: AVATAR_CACHE_CONTROL,
      ContentType: mimeType,
      Key: storageKey,
    }),
    { expiresIn: 10 * 60 },
  ); // creates presigned R2 PUT URL (used once to upload the file)

  return {
    fileUrl: getPublicFileUrl(storageKey),
    storageKey,
    uploadUrl,
  };
}

export async function createCoverUploadUrl({
  mimeType,
  originalName,
  userId,
}: CoverUploadInput) {
  const storageKey = createCoverStorageKey({ originalName, userId, mimeType }); // create key first (permanent identifier inside R2)
  const uploadUrl = await getSignedUrl(
    getR2Client(),
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      CacheControl: COVER_CACHE_CONTROL,
      ContentType: mimeType,
      Key: storageKey,
    }),
    { expiresIn: 10 * 60 },
  ); // creates presigned R2 PUT URL (used once to upload the file)

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

// used for deleting avatars
export async function deleteStoredObject(storageKey: string) {
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: getR2BucketName(),
      Key: storageKey,
    }),
  );
}
