import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/auth/AuthLayout";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async () => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("http://localhost:5000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/");
    } catch (err) {
      setError("Something went wrong. Is your server running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="rounded-2xl border border-surface-variant bg-white/90 p-7 shadow-raised backdrop-blur sm:p-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-secondary-container">
            Welcome back
          </p>
          <h1 className="auth-display mt-3 text-4xl font-black text-primary">
            Log in to NUSHub
          </h1>
          <p className="mt-3 text-sm leading-6 text-app-muted">
            Continue to your forum feed, study groups, and recent campus discussions.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-app-danger">
            {error}
          </div>
        )}

        <div className="mt-7 space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm font-bold text-app-text">
              Email
            </span>
            <input
              className="h-12 w-full rounded-lg border border-outline-variant bg-white px-4 text-sm font-semibold text-app-text outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@u.nus.edu"
              type="email"
              value={email}
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-bold text-app-text">
              Password
            </span>
            <input
              className="h-12 w-full rounded-lg border border-outline-variant bg-white px-4 text-sm font-semibold text-app-text outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              placeholder="Enter your password"
              type="password"
              value={password}
            />
          </label>
        </div>

        <button
          className="mt-7 flex h-12 w-full items-center justify-center rounded-lg bg-primary px-4 text-sm font-black text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-primary-container disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60"
          disabled={loading}
          onClick={handleLogin}
          type="button"
        >
          {loading ? "Logging in..." : "Log in"}
        </button>

        <div className="mt-6 rounded-lg bg-surface-low px-4 py-3 text-center text-sm font-semibold text-app-muted">
          New to NUSHub?{" "}
          <Link className="font-black text-primary hover:underline" to="/register">
            Create an account
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
