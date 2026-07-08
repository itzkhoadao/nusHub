import { io, type Socket } from "socket.io-client";
import type { ChatMessage } from "./chatApi";

const SOCKET_URL = import.meta.env.VITE_API_URL || "http://localhost:5000"; // backend url

type ServerToClientEvents = {
  "message:new": (message: ChatMessage) => void;
};

type ClientToServerEvents = Record<string, never>;

// stores one socket connection
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

function getToken() {
  return localStorage.getItem("token");
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
