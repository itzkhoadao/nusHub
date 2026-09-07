import { createContext, useContext } from "react";

export const PresenceContext = createContext<Set<string>>(new Set());

export function useIsUserOnline(userId?: string | number | null) {
  const onlineUserIds = useContext(PresenceContext);
  return userId != null && onlineUserIds.has(String(userId));
}
