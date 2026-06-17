import { Link, useLocation } from "react-router-dom";
import Icon from "../Icon";

const ITEMS = [
  { label: "Forum", to: "/", icon: "home" },
  { label: "Groups", to: "/groups", icon: "groups" },
  { label: "Post", to: "/create-post", icon: "plus", isAction: true },
  { label: "AI", to: "/", icon: "bot" },
  { label: "Profile", to: "/profile", icon: "post" },
];

export default function MobileNav() {
  const { pathname } = useLocation();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-surface-variant bg-white px-3 pb-2 pt-2 shadow-raised lg:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
        {ITEMS.map((item) => {
          const isActive =
            item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);

          return (
            <Link
              key={item.label}
              to={item.to}
              className={`flex flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-[11px] font-semibold ${
                item.isAction
                  ? "-mt-7 bg-primary p-3 text-white shadow-soft"
                  : isActive
                    ? "text-primary"
                    : "text-app-muted"
              }`}
            >
              <Icon name={item.icon} className="h-5 w-5" />
              {!item.isAction && <span>{item.label}</span>}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
