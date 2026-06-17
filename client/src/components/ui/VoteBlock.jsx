import Icon from "../Icon";

export default function VoteBlock({ count = 0, onUpvote, active = false }) {
  return (
    <div className="flex w-12 shrink-0 flex-col items-center rounded-lg bg-surface-low py-2 text-app-muted">
      <button
        aria-label="Upvote"
        className={`rounded-md p-1 transition-colors hover:text-secondary-container ${
          active ? "text-secondary-container" : ""
        }`}
        onClick={onUpvote}
        type="button"
      >
        <Icon name="chevronUp" className="h-5 w-5" />
      </button>
      <span className="text-sm font-bold text-app-text">{count}</span>
      <button
        aria-label="Downvote"
        className="rounded-md p-1 transition-colors hover:text-outline"
        type="button"
      >
        <Icon name="chevronDown" className="h-5 w-5" />
      </button>
    </div>
  );
}
