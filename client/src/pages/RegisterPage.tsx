import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthLayout from "../components/auth/AuthLayout";
import { apiUrl } from "../utils/api";

export default function RegisterPage() {
  // useState stores the values the user types into the form
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleButtonRef = useRef(null);

  // useNavigate lets us redirect the user to another page
  const navigate = useNavigate();

  const handleRegister = async () => {
    setLoading(true);
    setError("");

    try {
      // Send the form data to your backend
      const res = await fetch(apiUrl("/api/auth/register"), {
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

      // user is logged in
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

  const handleGoogleCredential = async (response) => {
    setGoogleLoading(true);
    setError("");

    try { // send Google credentials data to backend
      const res = await fetch(apiUrl("/api/auth/google"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return; 
      }

      // save user info got from backend to local storage
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      navigate("/");
    } catch (err) {
      setError("Google sign-in failed. Is your server running?");
    } finally {
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (!clientId || !googleButtonRef.current) {
      return;
    }

    const renderGoogleButton = () => {
      if (!window.google?.accounts?.id || !googleButtonRef.current) {
        return;
      }

      googleButtonRef.current.innerHTML = "";
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleGoogleCredential,
      }); // Use this app's Google Client ID, after sign in call handleGoogleCredential

      window.google.accounts.id.renderButton(googleButtonRef.current, {
        logo_alignment: "left",
        shape: "pill",
        size: "large",
        text: "continue_with",
        theme: "outline",
        width: 400,
      }); // render the actual Google sign in button
    };

    // If Google script is already loaded, render the button immediately
    if (window.google?.accounts?.id) {
      renderGoogleButton();
      return;
    }

    const existingScript = document.getElementById("google-identity-service");

    // checks if the script tag already exists, waits for it to finish loading
    if (existingScript) {
      existingScript.addEventListener("load", renderGoogleButton);
      return () =>
        existingScript.removeEventListener("load", renderGoogleButton); // remove listener to avoid duplicates
    }

    // If script does not exist, create it
    const script = document.createElement("script");
    script.id = "google-identity-service";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    document.body.appendChild(script);
  }, []);

  return (
    <AuthLayout>
      <div className="rounded-lg border border-slate-200 bg-white/90 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.14)] ring-1 ring-slate-900/5 backdrop-blur sm:p-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-secondary-container">
            Join the community
          </p>
          <h1 className="auth-display mt-2 text-3xl font-black text-primary">
            Create your account
          </h1>
          <p className="mt-2 text-sm leading-5 text-app-muted">
            Start posting, commenting, and joining NUS study groups with one account.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-app-danger">
            {error}
          </div>
        )}

        <div className="mt-5 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-app-text">
              Username
            </span>
            <input
              className="app-input h-11 text-sm font-semibold"
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. khoa123"
              value={username}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-app-text">
              Email
            </span>
            <input
              className="app-input h-11 text-sm font-semibold"
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@u.nus.edu"
              type="email"
              value={email}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-app-text">
              Password
            </span>
            <input
              className="app-input h-11 text-sm font-semibold"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRegister()}
              placeholder="Create a password"
              type="password"
              value={password}
            />
          </label>
        </div>

        <button
          className="app-button-secondary mt-5 h-11 w-full text-sm font-black"
          disabled={loading}
          onClick={handleRegister}
          type="button"
        >
          {loading ? "Creating account..." : "Create account"}
        </button>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-surface-variant" />
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-app-muted">
            or
          </span>
          <div className="h-px flex-1 bg-surface-variant" />
        </div>

        <div>
          <div className="flex justify-center" ref={googleButtonRef} />
          {googleLoading && (
            <p className="mt-2 text-center text-xs font-semibold text-app-muted">
              Signing in with Google...
            </p>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-surface-low px-4 py-3 text-center text-sm font-semibold text-app-muted shadow-sm">
          Already have an account?{" "}
          <Link className="font-black text-primary hover:underline" to="/login">
            Log in
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
