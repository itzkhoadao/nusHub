type LogoProps = {
  className?: string;
  iconClassName?: string;
  showTagline?: boolean;
  textClassName?: string;
  taglineClassName?: string;
  variant?: "default" | "inverse";
};

function LogoMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 56 56"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M9 48V18l17 17v13H9Z" fill="#d30b45" />
      <path d="M26 18h18v30H26V18Z" fill="#459bd2" />
      <path d="M9 18v30h17V35L9 18Z" fill="#d30b45" />
      <path d="M26 35v13h18L26 30v5Z" fill="#062b4d" />
      <path d="M9 18h6l29 30h-9L9 22v-4Z" fill="#102f4f" opacity="0.16" />
    </svg>
  );
}

export default function Logo({
  className = "flex items-center gap-3",
  iconClassName = "h-10 w-10",
  showTagline = false,
  textClassName,
  taglineClassName,
  variant = "default",
}: LogoProps) {
  const wordmarkClassName =
    textClassName ??
    (variant === "inverse"
      ? "text-xl font-black text-white"
      : "text-xl font-black text-primary");
  const taglineColor =
    taglineClassName ??
    (variant === "inverse"
      ? "text-xs font-semibold uppercase tracking-[0.18em] text-white/70"
      : "text-xs font-semibold uppercase tracking-[0.18em] text-app-muted");

  return (
    <div className={className}>
      <LogoMark className={iconClassName} />
      <div>
        <p className={wordmarkClassName}>NUSHub</p>
        {showTagline && <p className={taglineColor}>Student community</p>}
      </div>
    </div>
  );
}
