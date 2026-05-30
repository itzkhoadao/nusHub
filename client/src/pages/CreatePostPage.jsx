import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import Navbar from "../components/Navbar"

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
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">Create a Post</h1>

        <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-5">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm flex items-center gap-2">
              <span>⚠</span> {error}
            </div>
          )}

          {/* Topic */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Topic</label>
            <div className="flex gap-2 flex-wrap">
              {TOPICS.map(t => (
                <button
                  key={t}
                  onClick={() => setTopic(t)}
                  className={`px-3 py-1.5 rounded-full text-sm border font-medium transition-colors ${topic === t
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                    }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Title</label>
            <input
              className="w-full border border-gray-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              placeholder="What's your question or topic?"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Content <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              className="w-full border border-gray-200 rounded-lg p-3 text-sm h-36 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              placeholder="Add more details..."
              value={content}
              onChange={e => setContent(e.target.value)}
            />
          </div>

          {/* Anonymous toggle */}
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <div
              onClick={() => setIsAnonymous(!isAnonymous)}
              className={`w-10 h-6 rounded-full transition-colors relative ${isAnonymous ? 'bg-blue-600' : 'bg-gray-200'
                }`}
            >
              <div className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${isAnonymous ? 'translate-x-5' : 'translate-x-1'
                }`} />
            </div>
            <span className="text-sm text-gray-600">Post anonymously</span>
          </label>

          {/* Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Posting...' : 'Post'}
            </button>
            <button
              onClick={() => navigate('/')}
              className="px-5 py-3 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
