import { Link } from "react-router-dom";
import Icon from "../Icon";
import TopicBadge from "./TopicBadge";
import VoteBlock from "./VoteBlock";

export default function DiscussionCard({ post, onUpvote }) {
  const canOpenProfile = !post.is_anonymous && post.user_id;
  const profilePath = canOpenProfile ? `/users/${post.user_id}` : null;
  const authorInitial = (post.username || "A").charAt(0).toUpperCase();
  const actionClass =
    "flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-bold text-app-muted shadow-sm ring-1 ring-slate-900/5 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary-fixed/40 hover:text-primary";
  const authorAvatar = (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-fixed text-sm font-bold text-primary shadow-sm ring-2 ring-white">
      {post.avatar_url ? (
        <img
          alt=""
          className="h-full w-full object-cover"
          src={post.avatar_url}
        />
      ) : (
        authorInitial
      )}
    </span>
  );

  return (
    <article className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/5 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[0_18px_44px_rgba(0,39,84,0.10)]">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary-fixed to-secondary-container opacity-80" />
      <div className="min-w-0">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {canOpenProfile ? (
              <Link
                aria-label={`View ${post.username}'s profile`}
                className="transition-transform hover:-translate-y-0.5"
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
                {post.created_at && (
                  <span>{new Date(post.created_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <TopicBadge topic={post.topic} />
          </div>
        </div>

        <Link
          to={`/posts/${post.id}`}
          className="block text-lg font-bold leading-snug text-app-text transition-colors hover:text-primary"
        >
          {post.title}
        </Link>

        {post.content && (
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-app-muted">
            {post.content}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-surface-variant pt-4 text-xs font-semibold text-app-muted">
          <VoteBlock
            active={post.upvoted}
            count={post.upvotes}
            onUpvote={() => onUpvote?.(post.id)}
          />
          <Link
            to={`/posts/${post.id}`}
            className={actionClass}
          >
            <Icon name="message" className="h-4 w-4" />
            {post.comment_count || 0} replies
          </Link>
          <button
            className={actionClass}
            type="button"
          >
            <Icon name="share" className="h-4 w-4" />
            Share
          </button>
          <button
            className="ml-auto flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 text-xs font-bold text-app-muted shadow-sm ring-1 ring-slate-900/5 transition-all hover:-translate-y-0.5 hover:border-red-200 hover:bg-red-50 hover:text-app-danger"
            type="button"
          >
            <Icon name="flag" className="h-4 w-4" />
            Report
          </button>
        </div>
      </div>
    </article>
  );
}
