import { Link } from "react-router-dom";
import Icon from "../Icon";
import TopicBadge from "./TopicBadge";
import UserAvatar from "./UserAvatar";
import VoteBlock from "./VoteBlock";
import { API_URL } from "../../utils/api";
import ContentActionMenu from "./ContentActionMenu";
import { getStoredUser } from "../../utils/authStorage";

function isImageAttachment(mimeType = "") {
  return mimeType.startsWith("image/");
}

function isVideoAttachment(mimeType = "") {
  return mimeType.startsWith("video/");
}

function resolveAttachmentUrl(fileUrl = "") {
  if (!fileUrl) {
    return "";
  }

  return fileUrl.startsWith("http") ? fileUrl : `${API_URL}${fileUrl}`;
}

export default function DiscussionCard({
  articleId = undefined,
  children = null,
  commentLabel = "replies",
  onCommentsClick = undefined,
  onDelete,
  onPostLinkClick = undefined,
  onUpvote,
  post,
  postHref = undefined,
  topicContent = null,
}) {
  const user = getStoredUser();
  const canOpenProfile = !post.is_anonymous && post.user_id;
  const profilePath = canOpenProfile ? `/users/${post.user_id}` : null;
  const postDate = post.post_date || post.published_at || post.created_at;
  const attachments = Array.isArray(post.attachments) ? post.attachments : []; // list of files for this post
  const attachmentCount =
    attachments.length > 0 ? attachments.length : Number(post.attachment_count || 0);
  const onlyAttachment = attachmentCount === 1 ? attachments[0] : null;
  const onlyAttachmentUrl = resolveAttachmentUrl(onlyAttachment?.file_url);
  
  // only render visually when only 1 image or 1 video is uploaded
  const shouldPreviewSingleMedia =
    Boolean(onlyAttachmentUrl) &&
    (isImageAttachment(onlyAttachment?.mime_type) ||
      isVideoAttachment(onlyAttachment?.mime_type));
  
  const shouldShowFileSummary = attachmentCount > 0 && !shouldPreviewSingleMedia;
  const actionClass =
    "forum-card-action flex h-10 items-center gap-1.5 border bg-white px-4 text-xs font-bold text-app-muted";
  const resolvedPostHref = postHref || `/posts/${post.id}`;
  const authorAvatar = (
    <UserAvatar
      avatarUrl={post.avatar_url}
      name={post.username || "Anonymous"}
      userId={canOpenProfile ? post.user_id : null}
    />
  );

  return (
    <article
      className="forum-discussion-card group relative overflow-hidden border bg-white p-5"
      id={articleId}
    >
      <div className="forum-card-accent absolute inset-x-0 top-0 h-1" />
      <div className="min-w-0">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {canOpenProfile ? (
              <Link
                aria-label={`View ${post.username}'s profile`}
                className="forum-card-avatar transition-transform"
                to={profilePath}
              >
                {authorAvatar}
              </Link>
            ) : (
              authorAvatar
            )}

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-app-muted">
                {canOpenProfile ? (
                  <Link
                    className="font-bold text-app-text transition-colors hover:text-primary hover:underline"
                    to={profilePath}
                  >
                    {post.username}
                  </Link>
                ) : (
                  <span className="font-bold text-app-text">{post.username}</span>
                )}
                <span>-</span>
                {postDate && (
                  <span>{new Date(postDate).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>

          <div className="forum-card-topic shrink-0">
            {topicContent || <TopicBadge topic={post.topic} />}
          </div>
        </div>

        <Link
          onClick={onPostLinkClick}
          to={resolvedPostHref}
          className="forum-card-title block text-lg font-bold leading-snug text-app-text"
        >
          {post.title}
        </Link>

        {post.content && (
          <p className="forum-card-excerpt mt-2 line-clamp-2 text-sm leading-6 text-app-muted">
            {post.content}
          </p>
        )}

        {shouldPreviewSingleMedia && (
          <Link
            aria-label={`Open ${onlyAttachment.original_name}`}
            className="forum-card-media mt-4 flex min-h-56 items-center justify-center overflow-hidden border border-slate-200 bg-slate-950"
            onClick={onPostLinkClick}
            to={resolvedPostHref}
          >
            {isVideoAttachment(onlyAttachment.mime_type) ? (
              <video
                className="max-h-[420px] w-full object-contain"
                muted
                playsInline
                preload="metadata"
                src={onlyAttachmentUrl}
              />
            ) : (
              <img
                alt={onlyAttachment.original_name}
                className="max-h-[420px] w-full object-contain"
                loading="lazy"
                src={onlyAttachmentUrl}
              />
            )}
          </Link>
        )}

        {shouldShowFileSummary && (
          <Link
            aria-label={`${attachmentCount} attached file${
              attachmentCount === 1 ? "" : "s"
            }`}
            className="forum-card-files mt-4 flex items-center gap-4 border border-primary/25 bg-primary-fixed px-5 py-4 text-primary"
            onClick={onPostLinkClick}
            to={resolvedPostHref}
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/80 shadow-sm">
              <Icon name="paperclip" className="h-7 w-7" />
            </span>
            <span className="min-w-0">
              <span className="block text-xl font-black text-primary">
                {attachmentCount} file{attachmentCount === 1 ? "" : "s"}
              </span>
              <span className="mt-1 block text-sm font-semibold text-app-muted">
                Open post to view attachments
              </span>
            </span>
          </Link>
        )}

        <div className="forum-card-footer mt-5 flex flex-wrap items-center gap-3 border-t border-surface-variant pt-4 text-xs font-semibold text-app-muted">
          <VoteBlock
            active={post.upvoted}
            count={post.upvotes}
            onUpvote={() => onUpvote?.(post.id)}
          />
          {onCommentsClick ? (
            <button
              aria-expanded={Boolean(children)}
              className={actionClass}
              onClick={onCommentsClick}
              type="button"
            >
              <Icon name="message" className="h-4 w-4" />
              {post.comment_count || 0} {commentLabel}
            </button>
          ) : (
            <Link to={resolvedPostHref} className={actionClass}>
              <Icon name="message" className="h-4 w-4" />
              {post.comment_count || 0} {commentLabel}
            </Link>
          )}
          <button
            className={actionClass}
            type="button"
          >
            <Icon name="share" className="h-4 w-4" />
            Share
          </button>
          <ContentActionMenu
            isAuthor={String(user?.id) === String(post.user_id)}
            label="post"
            onDelete={() => onDelete?.(post.id)}
            postId={post.id}
            targetId={post.id}
          />
        </div>
        {children}
      </div>
    </article>
  );
}
