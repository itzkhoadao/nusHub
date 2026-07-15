import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import Icon from "../Icon";
import UserAvatar from "../ui/UserAvatar";
import { clearAuthSession } from "../../utils/authStorage";
import { disconnectChatSocket } from "../../utils/socket";

export default function Topbar({
  contextualPlaceholder = "Search NUSHub...",
  onSearchChange,
  onSearchClear,
  onSearchSubmit,
  searchValue,
  user,
}) {
  const [searchApplied, setSearchApplied] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const hasSearch = typeof onSearchChange === "function";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!searchValue) {
      setSearchApplied(false);
    }
  }, [searchValue]);

  useEffect(() => {
    if (!accountOpen) {
      return;
    }

    const closeAccountMenu = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) {
        setAccountOpen(false);
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
      }
    };

    document.addEventListener("mousedown", closeAccountMenu);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeAccountMenu);
      document.removeEventListener("keydown", closeOnEscape);
    }; // avoid duplication
  }, [accountOpen]);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (searchValue?.trim()) {
      setSearchApplied(true);
    }

    onSearchSubmit?.(searchValue);
  };

  const clearSearch = () => {
    setSearchApplied(false);
    onSearchChange("");
    onSearchClear?.();
  };

  const handleSignOut = () => {
    disconnectChatSocket();
    queryClient.clear();
    clearAuthSession();
    setAccountOpen(false);
    navigate("/login");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-surface-variant bg-white/95 backdrop-blur">
      <div className="app-container flex h-16 items-center gap-4">
        {hasSearch ? (
          <form className="relative flex-1" onSubmit={handleSubmit}>
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary"
            />
            <input
              className="app-input border-primary/20 bg-primary/5 pl-10 pr-10"
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={contextualPlaceholder}
              type="text"
              value={searchValue}
            />
            {searchValue && (
              <button
                aria-label="Remove search text"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary-fixed"
                onClick={() => {
                  setSearchApplied(false);
                  onSearchChange("");
                }}
                type="button"
              >
                x
              </button>
            )}
          </form>
        ) : (
          <div className="flex-1" />
        )}

        {hasSearch && searchApplied && (
          <button className="app-button-ghost px-3 py-2" onClick={clearSearch}>
            Clear
          </button>
        )}

        <button
          aria-label="Notifications"
          className="rounded-full p-2 text-app-muted transition-colors hover:bg-surface-low hover:text-primary"
          type="button"
        >
          <Icon name="bell" />
        </button>

        <div className="relative" ref={accountMenuRef}>
          <button
            aria-expanded={accountOpen}
            aria-label="Open account menu"
            className="rounded-full transition-opacity hover:opacity-90"
            onClick={() => setAccountOpen(!accountOpen)}
            type="button"
          >
            <UserAvatar
              avatarUrl={user?.avatar_url}
              className="h-9 w-9 text-sm"
              name={user?.username || "NUSHub user"}
            />
          </button>

          {accountOpen && (
            <div className="absolute right-0 top-12 z-50 w-44 overflow-hidden rounded-xl border border-surface-variant bg-white shadow-raised">
              <button
                className="block w-full px-4 py-3 text-left text-sm font-semibold text-app-text transition-colors hover:bg-surface-low hover:text-primary"
                onClick={() => {
                  setAccountOpen(false);
                  navigate("/profile");
                }}
                type="button"
              >
                My Profile
              </button>
              <button
                className="block w-full px-4 py-3 text-left text-sm font-semibold text-app-danger transition-colors hover:bg-red-50"
                onClick={handleSignOut}
                type="button"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
