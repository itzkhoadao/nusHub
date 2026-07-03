export default function VoteBlock({ count = 0, onUpvote, active = false }) {
  const handleClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onUpvote?.();
  };

  return (
    <button
      aria-label={active ? "Remove upvote" : "Upvote"}
      aria-pressed={active}
      className="group inline-flex shrink-0 self-start"
      onClick={handleClick}
      type="button"
    >
      <span
        className={`flex h-10 items-center gap-1.5 rounded-full border px-3.5 transition-all duration-200 group-hover:-translate-y-0.5 ${
          active
            ? "border-orange-500 bg-orange-500 text-white shadow-[0_10px_22px_rgba(249,115,22,0.24)] ring-1 ring-orange-300/60"
            : "border-slate-200 bg-white text-slate-500 shadow-sm ring-1 ring-slate-900/5 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
        }`}
      >
        <svg
          aria-hidden="true"
          fill="currentColor"
          height="14"
          viewBox="0 0 12 12"
          width="14"
        >
          <path d="M6 1L11 7H7V11H5V7H1L6 1Z" />
        </svg>
        <span className="text-sm font-bold">{count}</span>
      </span>
    </button>
  );
}
