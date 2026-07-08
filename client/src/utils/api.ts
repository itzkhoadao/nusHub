export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function apiUrl(path: string) {
  return `${API_URL}${path}`;
}
