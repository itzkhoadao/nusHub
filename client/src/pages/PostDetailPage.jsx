import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import AiAssistantCard from "../components/ui/AiAssistantCard";
import TopicBadge from "../components/ui/TopicBadge";
import VoteBlock from "../components/ui/VoteBlock";

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

  // asks the backend for one post using id
  const fetchPost = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`http://localhost:5000/api/posts/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
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

  // asks the backend for all comments belonging to this post
  const fetchComments = async () => {
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(
        `http://localhost:5000/api/posts/${id}/comments`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        },
      );
      const data = await res.json();
      setComments(data);
    } catch (err) {
      console.error("Failed to fetch comments:", err);
    }
  };

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    // runs when the page loads or whenever id changes
    fetchPost();
    fetchComments();
  }, [id]);

  // send typed comment text to backend
  // If successful, it clears the form and reloads comments
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

  // toggle upvote, reload comments
  const handleCommentUpvote = async (commentId) => {
    const token = localStorage.getItem("token"); // gets user's authentication token

    const res = await fetch(
      `http://localhost:5000/api/posts/${id}/comments/${commentId}/upvote`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      },
    ); // go to toggle upvote route
    const data = await res.json();

    setComments((currentComments) =>
      currentComments.map((comment) =>
        comment.id === commentId
          ? {
              ...comment,
              upvoted: data.upvoted,
              upvotes: Number(comment.upvotes) + (data.upvoted ? 1 : -1),
            }
          : comment,
      ),
    );
  };

  // toggle upvote then reload the post
  const handlePostUpvote = async () => {
    const token = localStorage.getItem("token");

    const res = await fetch(`http://localhost:5000/api/posts/${id}/upvote`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }); // go to toggle upvote route
    const data = await res.json();

    setPost((currentPost) => ({
      ...currentPost,
      upvoted: data.upvoted,
      upvotes: Number(currentPost.upvotes) + (data.upvoted ? 1 : -1),
    }));
  };

  if (loading) {
    return (
      <AppShell contextualPlaceholder="Search post..." user={user}>
        <div className="app-card p-10 text-center text-app-muted">
          Loading post...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      contextualPlaceholder="Search post..."
      sidebar={
        <div className="space-y-4">
          <AiAssistantCard
            description="Summarize this thread, find related discussions, or ask for study tips."
            title="Ask About This Thread"
          />

          {/* Related posts are UI-only for now. Later they can come from a backend endpoint. */}
          <section className="app-card p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-app-muted">
              Related Posts
            </h2>
            <div className="space-y-3">
              {[
                "Cheatsheet for Heap Sort and Priority Queues",
                "Is it worth using Tries for the next Problem Set?",
                "Mid-term venue allocations are out!",
              ].map((title) => (
                <Link
                  className="block rounded-lg border border-surface-variant bg-white p-3 text-sm font-semibold transition-colors hover:border-primary hover:text-primary"
                  key={title}
                  to="/"
                >
                  {title}
                </Link>
              ))}
            </div>
          </section>
        </div>
      }
      user={user}
    >
      <div className="space-y-6">
        <Link
          className="inline-flex items-center text-sm font-semibold text-app-muted hover:text-primary"
          to="/"
        >
          Back to forum
        </Link>

        {/* Main post card */}
        {post && (
          <article className="app-card p-5 md:p-6">
            <div className="flex gap-4">
              <VoteBlock
                active={post.upvoted}
                count={post.upvotes}
                onUpvote={handlePostUpvote}
              />

              <div className="min-w-0 flex-1">
                <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-app-muted">
                  <TopicBadge topic={post.topic} />
                  {post.is_anonymous || !post.user_id ? (
                    <span>Posted by {post.username}</span>
                  ) : (
                    <Link
                      className="font-semibold hover:text-primary"
                      to={`/users/${post.user_id}`}
                    >
                      Posted by {post.username}
                    </Link>
                  )}
                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                </div>

                <h1 className="text-2xl font-bold leading-tight text-app-text md:text-3xl">
                  {post.title}
                </h1>

                {post.content && (
                  <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-app-muted md:text-base">
                    {post.content}
                  </p>
                )}

                <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-surface-variant pt-4 text-sm font-semibold text-app-muted">
                  <button
                    className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-surface-low hover:text-primary"
                    type="button"
                  >
                    <Icon name="message" className="h-4 w-4" />
                    Reply
                  </button>
                  <button
                    className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-surface-low hover:text-primary"
                    type="button"
                  >
                    <Icon name="share" className="h-4 w-4" />
                    Share
                  </button>
                  <button
                    className="flex items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-surface-low hover:text-app-danger"
                    type="button"
                  >
                    <Icon name="flag" className="h-4 w-4" />
                    Report
                  </button>
                </div>
              </div>
            </div>
          </article>
        )}

        {/* Comment input */}
        <section className="app-card p-5">
          <h2 className="mb-4 text-lg font-bold text-app-text">
            {comments.length} Comment{comments.length !== 1 ? "s" : ""}
          </h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-app-danger">
              {error}
            </div>
          )}

          <textarea
            className="app-input min-h-28 resize-none"
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="What are your thoughts?"
            value={newComment}
          />

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex cursor-pointer select-none items-center gap-3">
              <button
                aria-pressed={isAnonymous}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  isAnonymous ? "bg-primary" : "bg-surface-highest"
                }`}
                onClick={() => setIsAnonymous(!isAnonymous)}
                type="button"
              >
                <span
                  className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    isAnonymous ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span className="text-sm font-semibold text-app-muted">
                Comment anonymously
              </span>
            </label>

            <div className="flex gap-2">
              <button
                className="app-button-ghost"
                onClick={() => {
                  setNewComment("");
                  setIsAnonymous(false);
                  setError("");
                }}
                type="button"
              >
                Cancel
              </button>
              <button
                className="app-button-primary"
                disabled={submitting}
                onClick={handleSubmitComment}
                type="button"
              >
                {submitting ? "Posting..." : "Comment"}
              </button>
            </div>
          </div>
        </section>

        {/* Comments list */}
        {comments.length === 0 ? (
          <section className="app-card p-8 text-center text-sm text-app-muted">
            No comments yet. Be the first!
          </section>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <article className="app-card app-card-hover p-4" key={comment.id}>
                <div className="flex gap-4">
                  <button
                    aria-label={
                      comment.upvoted ? "Remove comment upvote" : "Upvote comment"
                    }
                    aria-pressed={comment.upvoted}
                    className={`inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-full border px-3 text-xs font-bold transition-all hover:-translate-y-0.5 ${
                      comment.upvoted
                        ? "border-secondary-container/40 bg-secondary-container text-white shadow-[0_8px_18px_rgba(253,134,20,0.2)]"
                        : "border-surface-variant bg-white text-app-muted hover:border-primary/30 hover:bg-primary-fixed hover:text-primary"
                    }`}
                    onClick={() => handleCommentUpvote(comment.id)}
                    type="button"
                  >
                    <Icon name="chevronUp" className="h-4 w-4" />
                    <span>{comment.upvotes}</span>
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-6 text-app-text">
                      {comment.content}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-app-muted">
                      {comment.is_anonymous || !comment.user_id ? (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-fixed text-xs font-bold text-primary">
                          {comment.username.charAt(0).toUpperCase()}
                        </div>
                      ) : (
                        <Link
                          aria-label={`View ${comment.username}'s profile`}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-fixed text-xs font-bold text-primary transition-colors hover:bg-primary hover:text-white"
                          to={`/users/${comment.user_id}`}
                        >
                          {comment.username.charAt(0).toUpperCase()}
                        </Link>
                      )}
                      {comment.is_anonymous || !comment.user_id ? (
                        <span>{comment.username}</span>
                      ) : (
                        <Link
                          className="font-semibold hover:text-primary"
                          to={`/users/${comment.user_id}`}
                        >
                          {comment.username}
                        </Link>
                      )}
                      <span>{new Date(comment.created_at).toLocaleDateString()}</span>
                      <button
                        className="font-semibold hover:text-primary"
                        type="button"
                      >
                        Reply
                      </button>
                      <button
                        className="font-semibold hover:text-app-danger"
                        type="button"
                      >
                        Report
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
