import Icon from "../Icon";

export default function Topbar({
  contextualPlaceholder = "Search NUSHub...",
  user,
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-surface-variant bg-white/95 backdrop-blur">
      <div className="app-container flex h-16 items-center gap-4">
        <div className="relative hidden flex-1 md:block">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-app-muted"
          />
          <input
            className="app-input bg-surface-low pl-10"
            placeholder="Search posts, groups, or topics..."
            type="search"
          />
        </div>

        <div className="relative flex-1 md:max-w-xs">
          <Icon
            name="search"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary"
          />
          <input
            className="app-input border-primary/20 bg-primary/5 pl-10"
            placeholder={contextualPlaceholder}
            type="search"
          />
        </div>

        <button
          aria-label="Notifications"
          className="rounded-full p-2 text-app-muted transition-colors hover:bg-surface-low hover:text-primary"
          type="button"
        >
          <Icon name="bell" />
        </button>

        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">
          {user?.username?.charAt(0).toUpperCase() || "N"}
        </div>
      </div>
    </header>
  );
}
