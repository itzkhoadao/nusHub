import type { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import type { AuthUser } from "./types";

// stores the Socket.IO server instance, at first this server is null (not created)
let io: Server | null = null;

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
    socket.join(`user:${user.id}`); // puts the socket into a room
  });

  return io;
}

// export so that other files can later get the socket server by calling this
export function getSocketServer() {
  return io;
}
