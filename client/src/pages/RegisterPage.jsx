import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function RegisterPage() {
  // useState stores the values the user types into the form
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // useNavigate lets us redirect the user to another page
  const navigate = useNavigate();

  const handleRegister = async () => {
    setLoading(true);
    setError("");

    try {
      // Send the form data to your backend
      const res = await fetch("http://localhost:5000/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        // If backend returned an error, show it
        setError(data.error);
        return;
      }

      // Save the token in localStorage so we remember the user is logged in
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      // Redirect to home page
      navigate("/");
    } catch (err) {
      setError("Something went wrong. Is your server running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white p-8 rounded-lg shadow w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Join NUSHub</h1>

        {/* Show error message if something went wrong */}
        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        <input
          className="w-full border border-gray-300 rounded p-3 mb-3 text-sm"
          placeholder="Username"
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="w-full border border-gray-300 rounded p-3 mb-3 text-sm"
          placeholder="Email"
          type="email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full border border-gray-300 rounded p-3 mb-4 text-sm"
          placeholder="Password"
          type="password"
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleRegister}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>

        <p className="text-center text-sm text-gray-500 mt-4">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-600 hover:underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
