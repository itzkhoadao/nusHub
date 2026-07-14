// THIS FILE CONTAINS HTTPS API FUNCTIONS FOR CHAT
import { API_URL } from "./api";
import { getAuthToken, getStoredUser } from "./authStorage";

// base URLs
const CONVERSATIONS_URL = `${API_URL}/api/conversations`;

// model of a conversation object
export type Conversation = {
  id: string;
  type: "direct" | "group";
  created_at: string;
  updated_at: string;
  other_user_id: string | null;
  other_username: string | null;
  other_email: string | null;
  other_avatar_url: string | null;
  last_message_id: string | null;
  last_message_body: string | null;
  last_message_created_at: string | null;
  last_attachment_count: number;
  last_sender_id: string | null;
  last_sender_username: string | null;
  unread_count: number;
};

export type ChatAttachment = {
  id: string;
  original_name: string;
  mime_type: string;
  file_size: number;
  file_url: string;
  storage_key?: string; // internal R2 object key
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_username?: string | null;
  sender_avatar_url?: string | null;
  reply_to_message_id: string | null;
  reply_to_body: string | null;
  reply_to_sender_id: string | null;
  reply_to_sender_username: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  attachments: ChatAttachment[];
  seen_by_count: number;
  recipient_count: number;
  last_seen_at: string | null;
  status: "sent" | "seen";
};

export type MessageReadReceipt = {
  conversation_id: string;
  user_id: string;
  last_read_at: string;
};

type DirectConversationResponse = {
  conversation: Conversation;
};

// info returned by backend before uploading
type PresignedAttachmentUpload = {
  client_id: string;
  file_size: number;
  file_url: string; // URL later used to view or download file
  mime_type: string;
  original_name: string;
  storage_key: string;
  upload_url: string; // URL used to upload the file
};

export function getCurrentUserId() {
  const user = getStoredUser();
  return user?.id as string | undefined;
}

export function conversationsKey(userId: string) {
  return ["conversations", userId] as const;
}

export function messagesKey(userId: string, conversationId: string) {
  return ["messages", userId, conversationId] as const;
}

// generate login header (because backend routes use authenticate)
function getAuthHeaders() {
  const token = getAuthToken();

  if (!token) {
    throw new Error("You must be logged in to use chat");
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

// helper for reading backend responses
async function readJsonResponse<T>(response: Response): Promise<T> {
  const data = await response.json(); // converts response to json

  if (!response.ok) {
    throw new Error(data.error || "Chat request failed");
  }

  return data;
}

// loads all conversations for the current logged in user
export async function getConversations() {
  const response = await fetch(CONVERSATIONS_URL, {
    headers: getAuthHeaders(),
  });

  return readJsonResponse<Conversation[]>(response); // expects a list of conversations
}

export async function startDirectConversation(userId: string) {
  const response = await fetch(`${CONVERSATIONS_URL}/direct/${userId}`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  const data = await readJsonResponse<DirectConversationResponse>(response);

  return data.conversation;
}

// get messages of current conversation
export async function getMessages(conversationId: string) {
  const response = await fetch(`${CONVERSATIONS_URL}/${conversationId}/messages`, {
    headers: getAuthHeaders(),
  });

  return readJsonResponse<ChatMessage[]>(response);
}

// asks backend to create temporary upload permissions
async function createAttachmentUploadUrls(conversationId: string, files: File[]) {
  const response = await fetch(
    `${CONVERSATIONS_URL}/${conversationId}/attachments/presign`,
    {
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
    },
  );

  return readJsonResponse<{ uploads: PresignedAttachmentUpload[] }>(response);
}

async function uploadFileToR2(upload: PresignedAttachmentUpload, file: File) {
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

// send a new message to the conversation
export async function sendMessage(
  conversationId: string,
  body: string,
  replyToMessageId?: string | null,
  attachments: File[] = [],
) {
  let uploadedAttachments: Omit<ChatAttachment, "id">[] = [];

  if (attachments.length > 0) {
    const { uploads } = await createAttachmentUploadUrls(
      conversationId,
      attachments,
    );

    await Promise.all(
      uploads.map((upload) => {
        const file = attachments[Number(upload.client_id)];
        return uploadFileToR2(upload, file);
      }),
    ); // ipload files to R2

    uploadedAttachments = uploads.map((upload) => ({
      file_size: upload.file_size,
      file_url: upload.file_url,
      mime_type: upload.mime_type,
      original_name: upload.original_name,
      storage_key: upload.storage_key,
    })); // preparing permanent attachment metadata
  }

  const response = await fetch(`${CONVERSATIONS_URL}/${conversationId}/messages`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      attachments: uploadedAttachments,
      body,
      reply_to_message_id: replyToMessageId || null,
    }),
  });

  return readJsonResponse<ChatMessage>(response);
}

export async function markConversationRead(conversationId: string) {
  const response = await fetch(`${CONVERSATIONS_URL}/${conversationId}/read`, {
    method: "POST",
    headers: getAuthHeaders(),
  });

  return readJsonResponse<MessageReadReceipt>(response);
}
