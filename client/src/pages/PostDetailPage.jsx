import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import Navbar from "../components/Navbar";

const TOPIC_COLORS = {
  Modules: "bg-purple-50 text-purple-600",
  Housing: "bg-orange-50 text-orange-600",
  Food: "bg-green-50 text-green-600",
  Buses: "bg-blue-50 text-blue-600",
  Facilities: "bg-yellow-50 text-yellow-600",
  General: "bg-gray-100 text-gray-600",
}

export default function PostDetailPage() {
  const { id } = useParams(); // gets the post id from the URL
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const user = JSON.parse(localStorage.getItem("user")); // gets the saved user from the browser

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    // runs when the page loads or whenever id changes
    const fetchPost = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/posts/${id}`);
        const data = await res.json();
        if (!res.ok) {
          navigate("/"); // post not found, go home
          return;
        }
        setPost(data);
      } catch (err) {
        console.error("Failed to fetch post:", err);
      } finally {
        setLoading(false);
      }
    };

    const fetchComments = async () => {
      try {
        const res = await fetch(
          `http://localhost:5000/api/posts/${id}/comments`,
        );
        const data = await res.json();
        setComments(data);
      } catch (err) {
        console.error("Failed to fetch comments:", err);
      }
    };

    fetchPost();
    fetchComments();
  }, [id]);

  const fetchComments = async () => {
    try {
      const res = await fetch(
        `http://localhost:5000/api/posts/${id}/comments`,
      );
      const data = await res.json();
      setComments(data);
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    }
  };

  const handleSubmitComment = async () => {
    if (!newComment.trim()) {
      setError("Comment cannot be empty");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // token is needed because adding a comment requires authentication
      const token = localStorage.getItem("token");

      const res = await fetch(
        `http://localhost:5000/api/posts/${id}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: newComment,
            is_anonymous: isAnonymous,
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }
      // Clear the input and refresh comments
      setNewComment("");
      setIsAnonymous(false);
      fetchComments();
    } catch (err) {
      setError("Something went wrong. Is your server running?");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCommentUpvote = async (commentId) => {
    const token = localStorage.getItem("token"); // gets user's authentication token

    await fetch(
      `http://localhost:5000/api/posts/${id}/comments/${commentId}/upvote`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    ); // go to toggle upvote route
    fetchComments(); // refresh comments to show new upvote count and reorder
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Post card */}
        {post && (
          <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
            <span className={`inline-block text-xs px-2.5 py-1 rounded-full font-medium mb-3 ${TOPIC_COLORS[post.topic] || 'bg-gray-100 text-gray-600'}`}>
              {post.topic}
            </span>
            <h1 className="text-xl font-bold text-gray-800 leading-snug">
              {post.title}
            </h1>
            {post.content && (
              <p className="text-gray-600 mt-3 leading-relaxed text-sm">
                {post.content}
              </p>
            )}
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-50 text-xs text-gray-400">
              <span>by {post.username}</span>
              <span>·</span>
              <span>▲ {post.upvotes} upvotes</span>
              <span>·</span>
              <span>{new Date(post.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        )}

        {/* Comment input */}
        <div className="bg-white border border-gray-100 rounded-2xl p-5 mb-6">
          <h2 className="font-semibold text-gray-700 mb-3">
            {comments.length} Comment{comments.length !== 1 ? 's' : ''}
          </h2>

          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg mb-3 text-sm">
              {error}
            </div>
          )}

          <textarea
            className="w-full border border-gray-200 rounded-lg p-3 text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            placeholder="Write a comment..."
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
          />

          <div className="flex items-center justify-between mt-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => setIsAnonymous(!isAnonymous)}
                className={`w-8 h-5 rounded-full transition-colors relative ${isAnonymous ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
              >
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${isAnonymous ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`} />
              </div>
              <span className="text-xs text-gray-500">Anonymous</span>
            </label>

            <button
              onClick={handleSubmitComment}
              disabled={submitting}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Posting...' : 'Post Comment'}
            </button>
          </div>
        </div>

        {/* Comments list */}
        {comments.length === 0 ? (
          <p className="text-center text-gray-400 py-6 text-sm">
            No comments yet. Be the first!
          </p>
        ) : (
          <div className="space-y-3">
            {comments.map(comment => (
              <div key={comment.id} className="bg-white border border-gray-100 rounded-xl p-4">
                <div className="flex justify-between items-start gap-4">
                  <p className="text-sm text-gray-700 leading-relaxed flex-1">
                    {comment.content}
                  </p>
                  <button
                    onClick={() => handleCommentUpvote(comment.id)}
                    className="flex flex-col items-center text-gray-400 hover:text-blue-600 transition-colors flex-shrink-0 group"
                  >
                    <span className="text-sm group-hover:scale-110 transition-transform">▲</span>
                    <span className="text-xs font-semibold">{comment.upvotes}</span>
                  </button>
                </div>
                <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                  <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-medium text-xs">
                    {comment.username.charAt(0).toUpperCase()}
                  </div>
                  <span>{comment.username}</span>
                  <span>·</span>
                  <span>{new Date(comment.created_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
