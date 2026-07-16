import { apiUrl } from "./api";
import { getAuthToken, updateStoredUser } from "./authStorage";

export const currentUserKey = ["current-user"] as const;

export async function getCurrentUserProfile() {
  const token = getAuthToken();

  if (!token) {
    throw new Error("You must be logged in");
  }

  const response = await fetch(apiUrl("/api/users/me"), {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Failed to load current user");
  }

  updateStoredUser(data.user);
  return data.user;
}
