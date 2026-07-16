import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import MobileNav from "./MobileNav";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import {
  currentUserKey,
  getCurrentUserProfile,
} from "../../utils/currentUserApi";
import { getAuthToken } from "../../utils/authStorage";

type AppShellProps = {
  children: ReactNode;
  contextualPlaceholder?: string;
  onSearchChange?: (value: string) => void;
  onSearchClear?: () => void;
  onSearchSubmit?: (value: string) => void;
  searchValue?: string;
  user?: unknown;
  sidebar?: ReactNode;
};

export default function AppShell({
  children,
  contextualPlaceholder = "Search NUSHub",
  onSearchChange,
  onSearchClear,
  onSearchSubmit,
  searchValue = "",
  user,
  sidebar,
}: AppShellProps) {
  const navigate = useNavigate();
  const currentUserQuery = useQuery({
    queryKey: currentUserKey,
    queryFn: getCurrentUserProfile,
    enabled: Boolean(getAuthToken()),
    refetchOnMount: true,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
  });
  const shellUser = currentUserQuery.data || user;

  return (
    <div className="app-page flex">
      <Sidebar onCreatePost={() => navigate("/create-post")} />

      <div className="min-w-0 flex-1 pb-24 lg:pb-0">
        <Topbar
          contextualPlaceholder={contextualPlaceholder}
          onSearchChange={onSearchChange}
          onSearchClear={onSearchClear}
          onSearchSubmit={onSearchSubmit}
          searchValue={searchValue}
          user={shellUser}
        />
        <main className="app-container py-6 lg:py-8">
          {sidebar ? (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0">{children}</div>
              <aside className="hidden xl:block">{sidebar}</aside>
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
