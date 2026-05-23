// useState stores what the user types.
// fetch() sends login/register data to your Express backend.
// localStorage remembers the logged-in user after refresh.

import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";

const TOPICS = [
  "All",
  "Modules",
  "Housing",
  "Food",
  "Buses",
  "Facilities",
  "General",
];

export default function HomePage() {
  const [posts, setPosts] = useState([]);
  const [topic, setTopic] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Read the user from localStorage
  const user = JSON.parse(localStorage.getItem("user"));

  // Redirect to login if not logged in
  useEffect(() => {
    if (!user) navigate("/login");
  }, [user, navigate]);

  // Fetch posts whenever topic, sort, or search changes
  useEffect(() => {
    fetchPosts();
  }, [topic, sort]);

  const fetchPosts = async () => {
    setLoading(true);
    try {
      let url = `http://localhost:5000/api/posts?sort=${sort}`;
      if (topic !== "All") url += `&topic=${topic}`;
      if (search) url += `&search=${search}`;

      const res = await fetch(url); // send a request to backend URL
      const data = await res.json(); // take the response
      setPosts(data); // stores the posts into React state, the page updates
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    // Clear everything from localStorage
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    navigate("/login");
  };

  const handleUpvote = async (postId) => {
    const token = localStorage.getItem("token");
    await fetch(`http://localhost:5000/api/posts/${postId}/upvote`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    fetchPosts(); // refresh posts to show new upvote count
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-bold text-blue-600">NUSHub</h1>
        <div className="flex items-center gap-4">
          <Link
            to="/profile"
            className="text-sm text-gray-500 hover:text-blue-600"
          >
            Hello, Hello, {user?.username}!
          </Link>
          <Link
            to="/create-post"
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
          >
            + New Post
          </Link>
          <button
            onClick={handleLogout}
            className="text-sm text-red-500 hover:underline"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6">
        {/* Search bar */}
        <div className="flex gap-2 mb-4">
          <input
            className="flex-1 border border-gray-300 rounded p-2 text-sm"
            placeholder="Search posts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && fetchPosts()}
          />
          <button
            onClick={fetchPosts}
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm"
          >
            Search
          </button>
        </div>

        {/* Topic filters */}
        <div className="flex gap-2 flex-wrap mb-4">
          {TOPICS.map((t) => (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                topic === t
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-gray-300 text-gray-600 hover:border-blue-400"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Sort options */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setSort("recent")}
            className={`text-sm px-3 py-1 rounded ${
              sort === "recent"
                ? "bg-gray-200 font-medium"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            Recent
          </button>
          <button
            onClick={() => setSort("popular")}
            className={`text-sm px-3 py-1 rounded ${
              sort === "popular"
                ? "bg-gray-200 font-medium"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            Popular
          </button>
        </div>

        {/* Posts list */}
        {loading ? (
          <p className="text-center text-gray-400 py-8">Loading posts...</p>
        ) : posts.length === 0 ? (
          <p className="text-center text-gray-400 py-8">
            No posts yet. Be the first to post!
          </p>
        ) : (
          posts.map((post) => (
            <div
              key={post.id}
              className="bg-white border rounded-lg p-4 mb-3 hover:shadow transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">
                    {post.topic}
                  </span>
                  <Link
                    to={`/posts/${post.id}`}
                    className="font-semibold text-gray-800 mt-2 hover:text-blue-600 block"
                  >
                    {post.title}
                  </Link>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                    {post.content}
                  </p>
                  <div className="text-xs text-gray-400 mt-2">
                    by {post.is_anonymous ? "Anonymous" : post.username}·{" "}
                    {post.comment_count} comments ·{" "}
                    {new Date(post.created_at).toLocaleDateString()}
                  </div>
                </div>

                {/* Upvote button */}
                <button
                  onClick={() => handleUpvote(post.id)}
                  className="flex flex-col items-center ml-4 text-gray-400 hover:text-blue-600"
                >
                  <span className="text-lg">▲</span>
                  <span className="text-sm font-medium">{post.upvotes}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
