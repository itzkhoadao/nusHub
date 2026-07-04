import { Link, useLocation } from "react-router-dom";
import Icon from "../Icon";
import Logo from "../Logo";

const NAV_ITEMS = [
  { label: "Forum", to: "/", icon: "home" },
  { label: "Study Groups", to: "/groups", icon: "groups" },
];

export default function Sidebar({ onCreatePost }) {
  const { pathname } = useLocation();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-surface-variant bg-white px-5 py-6 lg:block">
      <Link to="/" className="mb-8 block">
        <Logo />
      </Link>

      <nav className="space-y-1">
        <p className="mb-3 px-3 text-xs font-bold uppercase tracking-wide text-app-muted">
          Navigation
        </p>
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);

          return (
            <Link
              key={item.label}
              to={item.to}
              className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition-colors ${
                isActive
                  ? "bg-primary-fixed text-primary"
                  : "text-app-muted hover:bg-surface-low hover:text-primary"
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <button
        className="app-button-secondary mt-8 w-full py-3"
        onClick={onCreatePost}
        type="button"
      >
        <Icon name="plus" className="h-4 w-4" />
        Create Post
      </button>
    </aside>
  );
}
