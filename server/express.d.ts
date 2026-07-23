import type { AuthUser } from "./types";

// extends original Request interface to have user and requestId types
declare global {
  namespace Express {
    interface Request {
      user: AuthUser;
      requestId: string;
    }
  }
}
