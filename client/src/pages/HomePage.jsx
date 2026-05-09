import { useNavigate } from "react-router-dom";

// useState stores what the user types.
// fetch() sends login/register data to your Express backend.
// localStorage remembers the logged-in user after refresh.

export default function HomePage() {
  // Read the user from localStorage
  const user = JSON.parse(localStorage.getItem("user"));
  const navigate = useNavigate();

  const handleLogout = () => {
    // Clear everything from localStorage
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  // If not logged in, redirect to login
  if (!user) {
    navigate("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-gray-800">NUSHub</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              Hello, {user.username}!
            </span>
            <button
              onClick={handleLogout}
              className="text-sm text-red-500 hover:underline"
            >
              Logout
            </button>
          </div>
        </div>
        <p className="text-gray-500">Forum posts will appear here soon!</p>
      </div>
    </div>
  );
}
