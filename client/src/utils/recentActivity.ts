// FRONTEND API HELPER
import { apiUrl } from "./api";

const RECENT_ACTIVITY_URL = apiUrl("/api/recent");

// get logged-in user's jwt token
function getAuthHeaders() {
  const token = localStorage.getItem("token");

  if (!token) {
    return null;
  }

  return {
    Authorization: `Bearer ${token}`,
  };
}

export async function getRecentActivity() {
  const headers = getAuthHeaders();

  if (!headers) {
    return [];
  } // If the user is not logged in, immediately returns an empty array

  try {
    const res = await fetch(RECENT_ACTIVITY_URL, { headers });

    if (!res.ok) {
      console.warn("Failed to load recent activity:", await res.text());
      return [];
    }

    return await res.json();
  } catch (err) {
    console.warn("Failed to load recent activity:", err);
    return [];
  }
}

export async function saveRecentActivity(item) {
  const headers = getAuthHeaders();

  if (!headers || !item?.id || !item?.type) {
    return; // item not valid
  }

  try {
    const res = await fetch(RECENT_ACTIVITY_URL, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: item.id,
        type: item.type,
      }),
    }); // send post request to add item to recent activity database

    if (!res.ok) {
      console.warn("Failed to save recent activity:", await res.text());
    }
  } catch (err) {
    console.warn("Failed to save recent activity:", err);
    // Recent activity is a convenience feature, so it should never break navigation.
  }
}
