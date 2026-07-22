import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";
import { getAuthToken } from "./authStorage";
import type { ChatMessage, MessageReadReceipt } from "./chatApi";
import type { AppNotification } from "./notificationsApi";

const SOCKET_URL = API_URL; // backend url

type ServerToClientEvents = {
  "message:new": (message: ChatMessage) => void;
  "message:read": (receipt: MessageReadReceipt) => void;
  "notification:new": (notification: AppNotification) => void;
  "presence:snapshot": (userIds: string[]) => void;
  "presence:update": (presence: {
    is_online: boolean;
    user_id: string;
  }) => void;
};

type ClientToServerEvents = Record<string, never>;

// stores one socket connection
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

function getToken() {
  return getAuthToken();
}

export function getChatSocket() {
  const token = getToken();

  if (!token) {
    return null;
  } // user not logged in => no chat socket

  if (!socket) {
    // if socket not exists, create one
    socket = io(SOCKET_URL, {
      autoConnect: false,
      auth: { token },
    });
  } else {
    socket.auth = { token };
  } // if already exists, update its token

  if (!socket.connected) {
    socket.connect();
  }

  return socket;
}

export function disconnectChatSocket() {
  socket?.disconnect();
  socket = null;
}
