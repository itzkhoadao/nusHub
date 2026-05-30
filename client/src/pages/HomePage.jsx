// useState stores what the user types.
// fetch() sends login/register data to your Express backend.
// localStorage remembers the logged-in user after refresh.

import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import Navbar from "../components/Navbar";

const TOPICS = [
  "All",
  "Modules",
  "Housing",
  "Food",
  "Buses",
  "Facilities",
  "General",
];

const TOPIC_COLORS = {
  Modules: "bg-purple-50 text-purple-600",
  Housing: "bg-orange-50 text-orange-600",
  Food: "bg-green-50 text-green-600",
  Buses: "bg-blue-50 text-blue-600",
  Facilities: "bg-yellow-50 text-yellow-600",
  General: "bg-gray-100 text-gray-600",
}

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
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchPosts = async () => {
      setLoading(true);
      try {
        let url = `http://localhost:5000/api/posts?sort=${sort}`;
        if (topic !== "All") {
          url += `&topic=${topic}`;
        }
        if (search) {
          url += `&search=${search}`;
        }

        const res = await fetch(url); // send a request to backend URL
        const data = await res.json(); // take the response
        setPosts(data); // stores the posts into React state, the page updates
      } catch (err) {
        console.error("Failed to fetch posts:", err);
      } finally {
        setLoading(false);
      }
    };
    // Fetch posts whenever topic, sort, or search changes
    fetchPosts()
  }, [topic, sort])

  const handleSearch = () => {
    const fetchPosts = async () => {
      setLoading(true)
      try {
        let url = `http://localhost:5000/api/posts?sort=${sort}`
        if (topic !== 'All') url += `&topic=${topic}`
        if (search) url += `&search=${search}`
        const res = await fetch(url)
        const data = await res.json()
        setPosts(data)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    fetchPosts()
  }

  const handleUpvote = async (postId) => {
    const token = localStorage.getItem("token");
    await fetch(`http://localhost:5000/api/posts/${postId}/upvote`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    handleSearch(); // refresh posts to update and show new upvote count
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Search bar */}
        <div className="flex gap-2 mb-5">
          <input
            className="flex-1 border border-gray-200 rounded-lg p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            placeholder="Search posts..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
          />
          <button
            onClick={handleSearch}
            className="bg-blue-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            Search
          </button>
        </div>

        {/* Topic filter pills */}
        <div className="flex gap-2 flex-wrap mb-4">
          {TOPICS.map(t => (
            <button
              key={t}
              onClick={() => setTopic(t)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors border ${topic === t
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
                }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Sort tabs */}
        <div className="flex gap-1 mb-6 bg-white border border-gray-200 rounded-lg p-1 w-fit">
          {['recent', 'popular'].map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${sort === s
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Posts */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl p-5 animate-pulse">
                <div className="h-3 bg-gray-100 rounded w-20 mb-3" />
                <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📭</div>
            <p className="text-gray-500 font-medium">No posts yet</p>
            <p className="text-gray-400 text-sm mt-1">Be the first to start a discussion!</p>
            <Link
              to="/create-post"
              className="inline-block mt-4 bg-blue-600 text-white px-5 py-2 rounded-lg text-sm hover:bg-blue-700 transition-colors"
            >
              Create a post
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {posts.map(post => (
              <div
                key={post.id}
                className="bg-white border border-gray-100 rounded-xl p-5 hover:shadow-sm hover:border-gray-200 transition-all"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium mb-2 ${TOPIC_COLORS[post.topic] || 'bg-gray-100 text-gray-600'}`}>
                      {post.topic}
                    </span>
                    <Link
                      to={`/posts/${post.id}`}
                      className="block font-semibold text-gray-800 hover:text-blue-600 transition-colors leading-snug"
                    >
                      {post.title}
                    </Link>
                    {post.content && (
                      <p className="text-sm text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
                        {post.content}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                      <span>by {post.username}</span>
                      <span>·</span>
                      <span>{post.comment_count} comments</span>
                      <span>·</span>
                      <span>{new Date(post.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>

                  {/* Upvote */}
                  <button
                    onClick={() => handleUpvote(post.id)}
                    className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0 group"
                  >
                    <span className="text-base group-hover:scale-110 transition-transform">▲</span>
                    <span className="text-sm font-semibold">{post.upvotes}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
