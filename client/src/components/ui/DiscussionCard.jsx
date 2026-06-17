import { Link } from "react-router-dom";
import Icon from "../Icon";
import TopicBadge from "./TopicBadge";
import VoteBlock from "./VoteBlock";

export default function DiscussionCard({ post, onUpvote }) {
  return (
    <article className="app-card app-card-hover p-5">
      <div className="flex gap-4">
        <VoteBlock count={post.upvotes} onUpvote={() => onUpvote?.(post.id)} />

        <div className="min-w-0 flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-app-muted">
            <TopicBadge topic={post.topic} />
            <span>Posted by {post.username}</span>
            {post.created_at && (
              <span>{new Date(post.created_at).toLocaleDateString()}</span>
            )}
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

          <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-semibold text-app-muted">
            <Link
              to={`/posts/${post.id}`}
              className="flex items-center gap-1 transition-colors hover:text-primary"
            >
              <Icon name="message" className="h-4 w-4" />
              {post.comment_count || 0} replies
            </Link>
            <button
              className="flex items-center gap-1 transition-colors hover:text-primary"
              type="button"
            >
              <Icon name="share" className="h-4 w-4" />
              Share
            </button>
            <button
              className="ml-auto flex items-center gap-1 transition-colors hover:text-app-danger"
              type="button"
            >
              <Icon name="flag" className="h-4 w-4" />
              Report
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
