import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import Icon from "../Icon";
import UserAvatar from "../ui/UserAvatar";
import { clearAuthSession } from "../../utils/authStorage";
import {
  getNotifications,
  markNotificationsRead,
  notificationsKey,
  type AppNotification,
} from "../../utils/notificationsApi";
import { disconnectChatSocket } from "../../utils/socket";
import { getChatSocket } from "../../utils/socket";

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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [shouldPulseNotificationBadge, setShouldPulseNotificationBadge] =
    useState(false); // badge animation state
  const accountMenuRef = useRef(null);
  const notificationsRef = useRef(null); // dropdown ref
  const hasSearch = typeof onSearchChange === "function";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const notificationsQuery = useQuery({
    queryKey: notificationsKey(user?.id), // keeps noti data associated with current user
    queryFn: getNotifications,
    enabled: Boolean(user?.id),
    staleTime: 60 * 1000,
  });
  const notifications = notificationsQuery.data?.notifications || [];
  const unreadNotificationCount = notificationsQuery.data?.unread_count || 0;

  useEffect(() => {
    if (!searchValue) {
      setSearchApplied(false);
    }
  }, [searchValue]);

  useEffect(() => {
    if (!accountOpen && !notificationsOpen) {
      return;
    }

    const closeMenus = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) {
        setAccountOpen(false);
      }

      if (!notificationsRef.current?.contains(event.target)) {
        setNotificationsOpen(false);
      }
    };

    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        setAccountOpen(false);
        setNotificationsOpen(false);
      }
    };

    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("keydown", closeOnEscape);
    }; // avoid duplication
  }, [accountOpen, notificationsOpen]);

  // listener for new notifications
  useEffect(() => {
    const socket = getChatSocket();

    if (!socket || !user?.id) {
      return;
    }

    const handleNewNotification = (notification: AppNotification) => {
      queryClient.setQueryData(
        notificationsKey(user.id),
        (currentData: any) => {
          if (!currentData) {
            return {
              notifications: [notification],
              unread_count: 1,
            }; // no existing cache => new notification is the first notification
          }

          return {
            notifications: [
              notification,
              ...currentData.notifications.filter(
                (item: AppNotification) => item.id !== notification.id,
              ),
            ].slice(0, 30),
            unread_count: (currentData.unread_count || 0) + 1,
          };
        },
      );
      setShouldPulseNotificationBadge(true);
      window.setTimeout(() => setShouldPulseNotificationBadge(false), 900);
    };

    socket.on("notification:new", handleNewNotification);

    return () => {
      socket.off("notification:new", handleNewNotification);
    }; // cleanup
  }, [queryClient, user?.id]);

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

  // opening the notification dropdown
  const openNotifications = () => {
    setNotificationsOpen((currentValue) => !currentValue); // toggles
    setAccountOpen(false);

    if (unreadNotificationCount > 0 && user?.id) {
      markNotificationsRead() // mark all as read
        .then(() => {
          queryClient.setQueryData(
            notificationsKey(user.id),
            (currentData: any) =>
              currentData
                ? {
                    ...currentData,
                    notifications: currentData.notifications.map(
                      (notification: AppNotification) => ({
                        ...notification,
                        read_at:
                          notification.read_at || new Date().toISOString(), // update frontend cache
                      }),
                    ),
                    unread_count: 0, // no notification unread
                  }
                : currentData,
          );
        })
        .catch(() => {
          queryClient.invalidateQueries({
            queryKey: notificationsKey(user.id),
          });
        });
    }
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

        <div className="relative" ref={notificationsRef}>
          <button
            aria-expanded={notificationsOpen}
            aria-label="Notifications"
            className="relative rounded-full p-2 text-app-muted transition-colors hover:bg-surface-low hover:text-primary"
            onClick={openNotifications}
            type="button"
          >
            <Icon name="bell" />
            {unreadNotificationCount > 0 && (
              <span
                className={`app-notification-badge absolute -right-1 -top-1 h-5 min-w-5 ${
                  shouldPulseNotificationBadge
                    ? "app-notification-badge-pulse"
                    : ""
                }`}
              >
                {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
              </span>
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-12 z-50 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-surface-variant bg-white shadow-[0_24px_70px_rgba(15,23,42,0.22)]">
              <div className="flex items-center justify-between border-b border-surface-variant px-4 py-3">
                <div>
                  <h2 className="text-sm font-bold text-app-text">
                    Notifications
                  </h2>
                  <p className="text-xs font-semibold text-app-muted">
                    Upvotes, comments, and replies
                  </p>
                </div>
                {notificationsQuery.isFetching && (
                  <span className="text-xs font-semibold text-app-muted">
                    Updating...
                  </span>
                )}
              </div>

              <div className="max-h-96 overflow-y-auto py-2">
                {notificationsQuery.isLoading ? (
                  <p className="px-4 py-6 text-center text-sm font-semibold text-app-muted">
                    Loading notifications...
                  </p>
                ) : notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm font-semibold text-app-muted">
                    No notifications yet.
                  </p>
                ) : (
                  notifications.map((notification) => (
                    <Link
                      className={`block border-l-4 px-4 py-3 transition-colors hover:bg-primary-fixed/30 ${
                        notification.read_at
                          ? "border-transparent"
                          : "border-secondary-container bg-orange-50/50"
                      }`}
                      key={notification.id}
                      onClick={() => setNotificationsOpen(false)}
                      to={notification.link_path}
                    >
                      <div className="flex gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-fixed text-primary">
                          <Icon
                            name={
                              notification.type.includes("upvote")
                                ? "chevronUp"
                                : "message"
                            }
                            className="h-4 w-4"
                          />
                        </span>
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-semibold leading-5 text-app-text">
                            {notification.message}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-app-muted">
                            {new Date(notification.created_at).toLocaleString(
                              [],
                              {
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                month: "short",
                              },
                            )}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

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
              userId={user?.id}
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
