import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import type { AuthUser } from "./types";

// stores the Socket.IO server instance, at first this server is null (not created)
let io: Server | null = null;

const PRESENCE_GRACE_MS = 3 * 60 * 1000;
const userSockets = new Map<string, Set<string>>(); // user ID → set of user's socket IDs
const offlineTimers = new Map<string, ReturnType<typeof setTimeout>>(); // user ID → their pending three-minute timer

function getOnlineUserIds() {
  return Array.from(userSockets.keys());
}

// config/create socket server
// receives HTTP server and attaches Socket.IO to it
export function configureSocketServer(httpServer: HttpServer) {
  // attach Socket.IO to the existing HTTP server
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:5173",
      credentials: true,
    },
  });

  // middleware for Socket.IO, runs before socket connection is accepted
  io.use((socket, next) => {
    // get token from frontend (when frontend connects, it sends JWT token from storage)
    const token = socket.handshake.auth?.token;

    if (typeof token !== "string") {
      return next(new Error("No token provided"));
    }

    try {
      // verify the token
      const user = jwt.verify(token, process.env.JWT_SECRET || "") as AuthUser;
      socket.data.user = user;
      next(); // allow connection
    } catch {
      next(new Error("Invalid token"));
    }
  });

  // handle successful connection
  io.on("connection", (socket) => {
    const user = socket.data.user as AuthUser;
    const userId = String(user.id);
    socket.join(`user:${userId}`); // puts the socket into a room

    // if user returns before 3 minutes, cancel offline timer
    const pendingOffline = offlineTimers.get(userId);
    if (pendingOffline) {
      clearTimeout(pendingOffline);
      offlineTimers.delete(userId);
    }

    const sockets = userSockets.get(userId) || new Set<string>(); // record new socket
    const wasOnline = userSockets.has(userId);
    sockets.add(socket.id); // add current socket to set
    userSockets.set(userId, sockets);

    socket.emit("presence:snapshot", getOnlineUserIds());
    if (!wasOnline) {
      io?.emit("presence:update", { is_online: true, user_id: userId });
    }

    socket.on("disconnect", () => {
      const remainingSockets = userSockets.get(userId);
      remainingSockets?.delete(socket.id); // remove that socket
      if (remainingSockets && remainingSockets.size > 0) return;

      const timer = setTimeout(() => {
        const currentSockets = userSockets.get(userId);
        if (currentSockets && currentSockets.size > 0) return;
        userSockets.delete(userId);
        offlineTimers.delete(userId);
        io?.emit("presence:update", { is_online: false, user_id: userId }); // no longer online
      }, PRESENCE_GRACE_MS); // 3-minute timer
      offlineTimers.set(userId, timer);
    });
  });

  return io;
}

// export so that other files can later get the socket server by calling this
export function getSocketServer() {
  return io;
}
