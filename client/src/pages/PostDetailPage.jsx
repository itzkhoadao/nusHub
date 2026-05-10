import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

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
    if (!user) navigate("/login");
  }, [user, navigate]);

  // runs when the page loads or whenever id changes
  useEffect(() => {
    fetchPost();
    fetchComments();
  }, [id]);

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
      const res = await fetch(`http://localhost:5000/api/posts/${id}/comments`);
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <div className="bg-white border-b px-6 py-4">
        <Link to="/" className="text-blue-600 text-sm hover:underline">
          ← Back to forum
        </Link>
      </div>

      <div className="max-w-2xl mx-auto p-6">
        {/* Post content */}
        {post && (
          <div className="bg-white border rounded-lg p-6 mb-6">
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">
              {post.topic}
            </span>
            <h1 className="text-xl font-bold text-gray-800 mt-3">
              {post.title}
            </h1>
            {post.content && (
              <p className="text-gray-600 mt-3 leading-relaxed">
                {post.content}
              </p>
            )}
            <div className="text-xs text-gray-400 mt-4 flex gap-3">
              <span>by {post.username}</span>
              <span>·</span>
              <span>{post.upvotes} upvotes</span>
              <span>·</span>
              <span>{new Date(post.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        )}

        {/* Comments section */}
        <h2 className="font-semibold text-gray-700 mb-4">
          {comments.length} Comment{comments.length !== 1 ? "s" : ""}
        </h2>

        {/* Add comment box */}
        <div className="bg-white border rounded-lg p-4 mb-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded mb-3 text-sm">
              {error}
            </div>
          )}
          <textarea
            className="w-full border border-gray-300 rounded p-3 text-sm h-24 resize-none"
            placeholder="Write a comment..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
          />
          <div className="flex items-center justify-between mt-3">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4"
              />
              Comment anonymously
            </label>
            <button
              onClick={handleSubmitComment}
              disabled={submitting}
              className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? "Posting..." : "Post Comment"}
            </button>
          </div>
        </div>

        {/* Comments list */}
        {comments.length === 0 ? (
          <p className="text-center text-gray-400 py-4">
            No comments yet. Be the first!
          </p>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="bg-white border rounded-lg p-4 mb-3"
            >
              <div className="flex justify-between items-start gap-4">
                {/* Comment text */}
                <p className="text-sm text-gray-700 leading-relaxed flex-1">
                  {comment.content}
                </p>

                {/* Upvote button */}
                <button
                  onClick={() => handleCommentUpvote(comment.id)}
                  className="flex flex-col items-center text-gray-400 hover:text-blue-600 flex-shrink-0"
                >
                  <span className="text-lg">▲</span>
                  <span className="text-sm font-medium">{comment.upvotes}</span>
                </button>
              </div>

              <div className="text-xs text-gray-400 mt-2 flex gap-3">
                <span>by {comment.username}</span>
                <span>·</span>
                <span>{new Date(comment.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
