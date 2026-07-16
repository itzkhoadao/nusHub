import { apiUrl } from "./api";
import { getAuthToken } from "./authStorage";

export type AppNotification = {
  id: string;
  recipient_id: string;
  actor_id: string | null; // user who causes the noti
  actor_username?: string | null;
  type: "comment_reply" | "comment_upvote" | "post_comment" | "post_upvote";
  post_id: string | null;
  comment_id: string | null;
  message: string;
  link_path: string; // where user will go when they click in that noti
  read_at: string | null;
  created_at: string;
};

export type NotificationsResponse = {
  notifications: AppNotification[]; // list of latest noti
  unread_count: number;
};

// user-specific cache key
export const notificationsKey = (userId?: string | null) =>
  ["notifications", userId || "guest"] as const;

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
    throw new Error(data.error || "Notification request failed");
  }

  return data;
}

// response contains:
// {
//   notifications: AppNotification[],
//   unread_count: number
// }
export async function getNotifications() {
  const response = await fetch(apiUrl("/api/notifications"), {
    headers: getAuthHeaders(),
  });

  return readJsonResponse<NotificationsResponse>(response);
}

// mark all noti as read
export async function markNotificationsRead() {
  const response = await fetch(apiUrl("/api/notifications/read-all"), {
    method: "POST",
    headers: getAuthHeaders(),
  });

  return readJsonResponse<{ ok: boolean }>(response);
}
