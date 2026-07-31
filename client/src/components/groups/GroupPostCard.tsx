import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../Icon";
import DiscussionCard from "../ui/DiscussionCard";
import TopicBadge from "../ui/TopicBadge";
import UserAvatar from "../ui/UserAvatar";
import VoteBlock from "../ui/VoteBlock";
import { apiUrl } from "../../utils/api";
import { getAuthToken } from "../../utils/authStorage";

function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatFileSize(bytes = 0) {
  return `${(Number(bytes) / (1024 * 1024)).toFixed(1)} MB`;
}

export default function GroupPostCard({
  initialOpen = false,
  post,
  user,
  onPostChanged,
  onPostDeleted,
}) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(initialOpen);
  const [comments, setComments] = useState([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const attachments = Array.isArray(post.attachments)
    ? post.attachments
    : [];

  const commentsByParent = useMemo(
    () =>
      comments.reduce((result, comment) => {
        const key = comment.parent_comment_id || "root";
        result[key] = result[key] || [];
        result[key].push(comment);
        return result;
      }, {}),
    [comments],
  );

  const fetchComments = async () => {
    setCommentsLoading(true);
    setError("");

    try {
      const response = await fetch(
        apiUrl(`/api/posts/${post.id}/comments`),
        { headers: authHeaders() },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load comments");
      setComments(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setCommentsLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchComments();
  }, [open, post.id]);

  const requireUser = () => {
    if (user) return true;
    navigate("/login");
    return false;
  };

  const togglePostUpvote = async () => {
    if (!requireUser()) return;

    const response = await fetch(apiUrl(`/api/posts/${post.id}/upvote`), {
      method: "POST",
      headers: authHeaders(),
    });
    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "Could not update upvote");
      return;
    }

    onPostChanged({
      ...post,
      upvoted: data.upvoted,
      upvotes: Number(post.upvotes) + (data.upvoted ? 1 : -1),
    });
  };

  const deletePost = async () => {
    const response = await fetch(apiUrl(`/api/posts/${post.id}`), {
      method: "DELETE",
      headers: authHeaders(),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Could not delete post");
    }

    onPostDeleted?.(post.id);
  };

  const submitComment = async (parentCommentId = null) => {
    if (!requireUser() || !post.can_comment) return;
    const content = parentCommentId ? replyText : commentText;
    if (!content.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(
        apiUrl(`/api/posts/${post.id}/comments`),
        {
          method: "POST",
          headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: content.trim(),
            parent_comment_id: parentCommentId,
          }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add comment");

      setCommentText("");
      setReplyText("");
      setReplyingTo(null);
      onPostChanged({
        ...post,
        comment_count: Number(post.comment_count) + 1,
      });
      await fetchComments();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleCommentUpvote = async (comment) => {
    if (!requireUser()) return;

    const response = await fetch(
      apiUrl(`/api/posts/${post.id}/comments/${comment.id}/upvote`),
      { method: "POST", headers: authHeaders() },
    );
    const data = await response.json();

    if (!response.ok) {
      setError(data.error || "Could not update comment upvote");
      return;
    }

    setComments((current) =>
      current.map((item) =>
        item.id === comment.id
          ? {
              ...item,
              upvoted: data.upvoted,
              upvotes: Number(item.upvotes) + (data.upvoted ? 1 : -1),
            }
          : item,
      ),
    );
  };

  const renderComments = (parentId = "root", depth = 0) =>
    (commentsByParent[parentId] || []).map((comment) => (
      <div
        className={`group-post-comment ${depth ? "is-reply" : ""}`}
        key={comment.id}
      >
        <div className="flex items-start gap-3">
          <Link to={`/users/${comment.user_id}`}>
            <UserAvatar
              avatarUrl={comment.avatar_url}
              className="h-8 w-8 text-xs"
              name={comment.username}
              userId={comment.user_id}
            />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Link
                className="font-bold text-app-text hover:text-primary hover:underline"
                to={`/users/${comment.user_id}`}
              >
                {comment.username}
              </Link>
              <span className="text-app-muted">
                {new Date(comment.created_at).toLocaleDateString()}
              </span>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-app-text">
              {comment.content}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <VoteBlock
                active={comment.upvoted}
                count={comment.upvotes}
                onUpvote={() => toggleCommentUpvote(comment)}
              />
              {post.can_comment && (
                <button
                  className="group-post-text-action"
                  onClick={() => {
                    setReplyingTo(
                      replyingTo === comment.id ? null : comment.id,
                    );
                    setReplyText("");
                  }}
                  type="button"
                >
                  Reply
                </button>
              )}
            </div>
            {replyingTo === comment.id && (
              <div className="group-post-reply-form mt-3">
                <textarea
                  aria-label={`Reply to ${comment.username}`}
                  autoFocus
                  onChange={(event) => setReplyText(event.target.value)}
                  placeholder={`Reply to ${comment.username}…`}
                  rows={2}
                  value={replyText}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    className="group-post-submit"
                    disabled={submitting || !replyText.trim()}
                    onClick={() => submitComment(comment.id)}
                    type="button"
                  >
                    Reply
                  </button>
                  <button
                    className="group-post-text-action"
                    onClick={() => setReplyingTo(null)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {renderComments(comment.id, depth + 1)}
          </div>
        </div>
      </div>
    ));

  return (
    <DiscussionCard
      articleId={`group-post-${post.id}`}
      commentLabel="replies"
      onCommentsClick={() => setOpen((value) => !value)}
      onDelete={deletePost}
      onPostLinkClick={(event) => {
        event.preventDefault();
        setOpen(true);
      }}
      onUpvote={togglePostUpvote}
      post={post}
      postHref={`/groups/${post.group_id}?post=${post.id}`}
      topicContent={
        <span
          title={
            post.group_privacy === "public"
              ? "Anyone can view and upvote"
              : "Only group members can view"
          }
        >
          <TopicBadge
            topic={post.group_privacy === "public" ? "Public" : "Group only"}
          />
        </span>
      }
    >
      {open && (
        <section className="group-post-comments mt-5">
          {error && <p className="group-post-error">{error}</p>}

          {attachments.length > 0 && (
            <div className="group-post-attachment-list mb-4">
              {attachments.map((attachment) => (
                <a
                  className="group-post-attachment"
                  href={attachment.file_url}
                  key={attachment.id || attachment.storage_key}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span className="group-post-attachment-icon">
                    <Icon name="file" className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong>{attachment.original_name}</strong>
                    <small>{formatFileSize(attachment.file_size)}</small>
                  </span>
                  <span className="group-post-attachment-open" aria-hidden="true">
                    ↗
                  </span>
                </a>
              ))}
            </div>
          )}

          {post.can_comment ? (
            <div className="group-post-comment-form">
              <textarea
                aria-label="Add a comment"
                onChange={(event) => setCommentText(event.target.value)}
                placeholder="Add to the discussion…"
                rows={3}
                value={commentText}
              />
              <button
                className="group-post-submit mt-2"
                disabled={submitting || !commentText.trim()}
                onClick={() => submitComment()}
                type="button"
              >
                Comment
              </button>
            </div>
          ) : (
            <p className="group-post-readonly-note">
              Public post: join the group to comment or reply.
            </p>
          )}

          <div className="mt-4 space-y-3">
            {commentsLoading ? (
              <p className="py-3 text-sm text-app-muted">Loading comments…</p>
            ) : comments.length ? (
              renderComments()
            ) : (
              <p className="py-3 text-sm text-app-muted">No comments yet.</p>
            )}
          </div>
        </section>
      )}
    </DiscussionCard>
  );
}
