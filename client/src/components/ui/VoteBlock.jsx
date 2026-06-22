import Icon from "../Icon";

export default function VoteBlock({ count = 0, onUpvote, active = false }) {
  return (
    <button
      aria-label={active ? "Remove upvote" : "Upvote"}
      aria-pressed={active}
      className={`inline-flex h-10 shrink-0 items-center gap-1.5 self-start rounded-full border px-3 text-sm font-bold transition-all hover:-translate-y-0.5 ${
        active
          ? "border-secondary-container/40 bg-secondary-container text-white shadow-[0_8px_18px_rgba(253,134,20,0.24)]"
          : "border-surface-variant bg-white text-app-muted hover:border-primary/30 hover:bg-primary-fixed hover:text-primary"
      }`}
      onClick={onUpvote}
      type="button"
    >
      <Icon name="chevronUp" className="h-4 w-4" />
      <span>{count}</span>
    </button>
  );
}
