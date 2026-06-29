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
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyContent, setReplyContent] = useState("");
  const [replyIsAnonymous, setReplyIsAnonymous] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const postActionClass =
    "flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-app-muted shadow-sm ring-1 ring-slate-900/5 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary-fixed/40 hover:text-primary";

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

  // send a reply under a specific comment
  const handleSubmitReply = async (parentCommentId) => {
    if (!replyContent.trim()) {
      setError("Reply cannot be empty");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const token = localStorage.getItem("token"); // only logged in users can reply

      const res = await fetch(
        `http://localhost:5000/api/posts/${id}/comments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            content: replyContent,
            is_anonymous: replyIsAnonymous,
            parent_comment_id: parentCommentId, // also send info about parent comment when submitting
          }),
        },
      );

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      // clear reply box
      setReplyingTo(null);
      setReplyContent("");
      setReplyIsAnonymous(false);
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

  const topLevelComments = comments.filter(
    (comment) => !comment.parent_comment_id,
  );
  const repliesByParentId = comments.reduce((groups, comment) => {
    if (comment.parent_comment_id) {
      groups[comment.parent_comment_id] =
        groups[comment.parent_comment_id] || [];
      groups[comment.parent_comment_id].push(comment);
    }

    return groups;
  }, {}); // builds a lookup object that groups replies by their parent's id
  // repliesByParentId[X] returns the replies to comment X

  // recursive renderer lets every reply behave like a normal comment
  // if a reply has its own replies, this function calls itself again
  const renderCommentCard = (comment, depth = 0) => {
    const canOpenProfile = !comment.is_anonymous && comment.user_id;
    const profilePath = canOpenProfile ? `/users/${comment.user_id}` : null;
    const replies = repliesByParentId[comment.id] || []; // replies to the current comment/reply
    const isReplying = replyingTo === comment.id;
    const isNested = depth > 0;
    const depthColor = depth % 3 === 1 ? "border-l-primary/25" : "border-l-orange-200";
    const avatarSize = isNested ? "h-9 w-9 text-xs" : "h-10 w-10 text-sm";
    const wrapperIndent = isNested
      ? `ml-4 border-l-2 ${depthColor} pl-4 sm:ml-6`
      : ""; // later recursive calls, bigger depth => more indent levels
    const actionClass =
      "flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-bold text-app-muted shadow-sm ring-1 ring-slate-900/5 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary-fixed/40 hover:text-primary";
    const avatar = (
      <span
        className={`flex ${avatarSize} shrink-0 items-center justify-center rounded-full bg-primary-fixed font-bold text-primary shadow-sm ring-2 ring-white`}
      >
        {comment.username.charAt(0).toUpperCase()}
      </span>
    );

    const toggleReplyBox = () => {
      if (replyingTo === comment.id) {
        setReplyingTo(null);
        setReplyContent("");
        setReplyIsAnonymous(false);
        return;
      }

      setReplyingTo(comment.id);
      setReplyContent("");
      setReplyIsAnonymous(false);
    };

    return (
      <div className={`${wrapperIndent} space-y-3`} key={comment.id}>
        <article
          className={`relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.05)] ring-1 ring-slate-900/5 transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_16px_38px_rgba(0,39,84,0.09)] ${
            isNested ? "p-4" : "p-5"
          }`}
        >
          <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary-fixed via-white to-secondary-fixed opacity-80" />
          <div className="mb-4 flex min-w-0 items-center gap-3">
            {canOpenProfile ? (
              <Link
                aria-label={`View ${comment.username}'s profile`}
                className="transition-transform hover:-translate-y-0.5"
                to={profilePath}
              >
                {avatar}
              </Link>
            ) : (
              avatar
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-app-muted">
                {canOpenProfile ? (
                  <Link
                    className="font-bold text-app-text transition-colors hover:text-primary hover:underline"
                    to={profilePath}
                  >
                    {comment.username}
                  </Link>
                ) : (
                  <span className="font-bold text-app-text">
                    {comment.username}
                  </span>
                )}
                <span>-</span>
                <span>{new Date(comment.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          <p className="text-sm leading-6 text-app-text">{comment.content}</p>

          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-surface-variant pt-4 text-xs font-semibold text-app-muted">
            <VoteBlock
              active={comment.upvoted}
              count={comment.upvotes}
              onUpvote={() => handleCommentUpvote(comment.id)}
            />
            <button
              className={actionClass}
              onClick={toggleReplyBox}
              type="button"
            >
              <Icon name="message" className="h-4 w-4" />
              Reply
            </button>
            <button
              className="ml-auto flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-bold text-app-muted shadow-sm ring-1 ring-slate-900/5 transition-all hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:text-app-danger"
              type="button"
            >
              <Icon name="flag" className="h-4 w-4" />
              Report
            </button>
          </div>
        </article>
        {isReplying && (
          <div className="rounded-lg border border-primary/15 bg-white p-4 shadow-[0_12px_28px_rgba(0,39,84,0.07)] ring-1 ring-primary/10">
            <textarea
              className="app-input min-h-16 resize-none bg-white py-2 text-sm shadow-inner"
              onChange={(event) => setReplyContent(event.target.value)}
              placeholder={`Reply to ${comment.username}...`}
              value={replyContent}
            />
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex cursor-pointer select-none items-center gap-3">
                <button
                  aria-pressed={replyIsAnonymous}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                    replyIsAnonymous ? "bg-primary" : "bg-surface-highest"
                  }`}
                  onClick={() => setReplyIsAnonymous(!replyIsAnonymous)}
                  type="button"
                >
                  <span
                    className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                      replyIsAnonymous ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
                <span className="text-sm font-semibold text-app-muted">
                  Reply anonymously
                </span>
              </label>

              <div className="flex gap-2">
                <button
                  className="app-button-ghost"
                  onClick={() => {
                    setReplyingTo(null);
                    setReplyContent("");
                    setReplyIsAnonymous(false);
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="app-button-primary"
                  disabled={submitting}
                  onClick={() => handleSubmitReply(comment.id)}
                  type="button"
                >
                  {submitting ? "Replying..." : "Reply"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* then for each reply, call this same function again */}
        {replies.map((reply) => renderCommentCard(reply, depth + 1))}
      </div>
    );
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
          <article className="relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.07)] ring-1 ring-slate-900/5 md:p-6">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-primary via-primary-fixed to-secondary-container" />
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {post.is_anonymous || !post.user_id ? (
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-sm font-bold text-primary shadow-sm ring-2 ring-white">
                    {post.username.charAt(0).toUpperCase()}
                  </span>
                ) : (
                  <Link
                    aria-label={`View ${post.username}'s profile`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-sm font-bold text-primary shadow-sm ring-2 ring-white transition-all hover:-translate-y-0.5 hover:bg-primary hover:text-white"
                    to={`/users/${post.user_id}`}
                  >
                    {post.username.charAt(0).toUpperCase()}
                  </Link>
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-app-muted">
                    {post.is_anonymous || !post.user_id ? (
                      <span className="font-bold text-app-text">
                        {post.username}
                      </span>
                    ) : (
                      <Link
                        className="font-bold text-app-text transition-colors hover:text-primary hover:underline"
                        to={`/users/${post.user_id}`}
                      >
                        {post.username}
                      </Link>
                    )}
                    <span>-</span>
                    <span>
                      {new Date(post.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                <TopicBadge topic={post.topic} />
              </div>
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
              <VoteBlock
                active={post.upvoted}
                count={post.upvotes}
                onUpvote={handlePostUpvote}
              />
              <button
                className={postActionClass}
                type="button"
              >
                <Icon name="message" className="h-4 w-4" />
                Reply
              </button>
              <button
                className={postActionClass}
                type="button"
              >
                <Icon name="share" className="h-4 w-4" />
                Share
              </button>
              <button
                className="ml-auto flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-sm font-bold text-app-muted shadow-sm ring-1 ring-slate-900/5 transition-all hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:text-app-danger"
                type="button"
              >
                <Icon name="flag" className="h-4 w-4" />
                Report
              </button>
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
          <div className="space-y-4">
            {topLevelComments.map((comment) => renderCommentCard(comment))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
