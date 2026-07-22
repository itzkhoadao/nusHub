import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  AUTH_SESSION_CHANGE_EVENT,
  getAuthToken,
} from "../utils/authStorage";
import { getChatSocket } from "../utils/socket";

const PresenceContext = createContext<Set<string>>(new Set());

export function PresenceProvider({ children }: { children: ReactNode }) {
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [authVersion, setAuthVersion] = useState(0);

  useEffect(() => {
    const handleAuthChange = () => setAuthVersion((version) => version + 1); // run when login/logout
    window.addEventListener(AUTH_SESSION_CHANGE_EVENT, handleAuthChange);
    return () => {
      window.removeEventListener(AUTH_SESSION_CHANGE_EVENT, handleAuthChange);
    };
  }, []);

  // when login/logout, do this
  useEffect(() => {
    if (!getAuthToken()) {
      setOnlineUserIds(new Set());
      return;
    }

    const socket = getChatSocket();
    if (!socket) return;

    const handleSnapshot = (userIds: string[]) => {
      setOnlineUserIds(new Set(userIds.map(String)));
    }; // set all these users to online

    const handleUpdate = ({
      is_online,
      user_id,
    }: {
      is_online: boolean;
      user_id: string;
    }) => {
      setOnlineUserIds((current) => { // current: latest state
        const next = new Set(current);
        if (is_online) next.add(String(user_id));
        else next.delete(String(user_id));
        return next;
      });
    };

    socket.on("presence:snapshot", handleSnapshot);
    socket.on("presence:update", handleUpdate);
    return () => {
      socket.off("presence:snapshot", handleSnapshot);
      socket.off("presence:update", handleUpdate);
    }; // cleans up listeners
  }, [authVersion]);

  const value = useMemo(() => onlineUserIds, [onlineUserIds]);
  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

export function useIsUserOnline(userId?: string | number | null) {
  const onlineUserIds = useContext(PresenceContext);
  return userId != null && onlineUserIds.has(String(userId));
}
