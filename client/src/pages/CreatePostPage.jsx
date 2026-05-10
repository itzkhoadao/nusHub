import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";

const TOPICS = ["Modules", "Housing", "Food", "Buses", "Facilities", "General"];

export default function CreatePostPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [topic, setTopic] = useState("General");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");

      const res = await fetch("http://localhost:5000/api/posts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // send token to prove who we are
        },
        body: JSON.stringify({
          title,
          content,
          topic,
          is_anonymous: isAnonymous,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      navigate("/"); // go back to home after posting
    } catch (err) {
      setError("Something went wrong. Is your server running?");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <Link to="/" className="text-blue-600 text-sm hover:underline">
          ← Back to forum
        </Link>
      </div>

      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Create a Post</h1>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Topic selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Topic
          </label>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full border border-gray-300 rounded p-2 text-sm"
          >
            {TOPICS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Title */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Title
          </label>
          <input
            className="w-full border border-gray-300 rounded p-3 text-sm"
            placeholder="What's your question or topic?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>

        {/* Content */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Content (optional)
          </label>
          <textarea
            className="w-full border border-gray-300 rounded p-3 text-sm h-40 resize-none"
            placeholder="Add more details..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>

        {/* Anonymous toggle */}
        <div className="flex items-center gap-2 mb-6">
          <input
            type="checkbox"
            id="anonymous"
            checked={isAnonymous}
            onChange={(e) => setIsAnonymous(e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="anonymous" className="text-sm text-gray-600">
            Post anonymously
          </label>
        </div>

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Posting..." : "Post"}
        </button>
      </div>
    </div>
  );
}
