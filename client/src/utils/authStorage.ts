const TOKEN_KEY = "token";
const USER_KEY = "user";
export const AUTH_SESSION_CHANGE_EVENT = "nushub:auth-session-change";

function notifyAuthSessionChange() {
  window.dispatchEvent(new Event(AUTH_SESSION_CHANGE_EVENT));
}

export function getAuthToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  const storedUser = sessionStorage.getItem(USER_KEY);

  if (!storedUser) {
    return null;
  }

  try {
    return JSON.parse(storedUser);
  } catch {
    clearAuthSession();
    return null;
  }
}

export function setAuthSession(token: string, user: unknown) {
  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
  notifyAuthSessionChange();
}

export function updateStoredUser(user: unknown) {
  sessionStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
  notifyAuthSessionChange();
}
