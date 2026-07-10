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
  last_sender_id: string | null;
  last_sender_username: string | null;
};

export type ChatMessage = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_username?: string | null;
  sender_avatar_url?: string | null;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
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

// send a new message to the conversation
export async function sendMessage(conversationId: string, body: string) {
  const response = await fetch(`${CONVERSATIONS_URL}/${conversationId}/messages`, {
    method: "POST",
    headers: {
      ...getAuthHeaders(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
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
