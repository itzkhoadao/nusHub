import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import AiAssistantCard from "../components/ui/AiAssistantCard";
import LoadingState, { LoadingLabel } from "../components/ui/LoadingState";
import { apiUrl } from "../utils/api";
import { getAuthToken, getStoredUser } from "../utils/authStorage";

export default function GroupsPage() {
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroup, setNewGroup] = useState({
    name: "",
    module_code: "",
    description: "",
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const user = getStoredUser();

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchGroups = async () => {
      setLoading(true);

      try {
        let url = apiUrl("/api/groups");
        if (search) {
          url += `?search=${search}`;
        }
        const res = await fetch(url); // ask for GET request from backend
        const data = await res.json(); // extract JSON from response
        setGroups(data);
      } catch (err) {
        console.error("Failed to fetch groups:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [search]);

  const handleCreateGroup = async () => {
    if (!newGroup.name.trim()) {
      setError("Group name is required");
      return;
    }

    if (newGroup.module_code.length > 20) {
      setError("Module code must be 20 characters or fewer. Use something like MA1521.");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const token = getAuthToken();

      // HTTP post request
      const res = await fetch(apiUrl("/api/groups"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newGroup), // convert newGroup object to JSON
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      // redirect to the new group's page
      navigate(`/groups/${data.id}`);
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  // clearSearch removes the search text and shows all groups again
  const clearSearch = () => {
    setSearch("");
  };

  return (
    <AppShell
      contextualPlaceholder="Search groups..."
      onSearchChange={setSearch}
      onSearchClear={clearSearch}
      onSearchSubmit={() => {}}
      searchValue={search}
      sidebarSize="compact"
      sidebar={
        <div className="forum-sidebar-stack groups-sidebar space-y-4">
          <AiAssistantCard
            description="Find study partners, summarize group resources, or ask for module planning ideas."
            title="AI Study Assistant"
          />

          <section className="app-section-card forum-recent-panel group-areas-panel">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-app-muted">
              Active Study Areas
            </h2>
            <div className="space-y-3 text-sm">
              {["CS2040S", "CS2103T", "MA1521"].map((moduleCode) => (
                <div
                  className="group-area-item flex items-center justify-between border border-slate-200 bg-white p-3"
                  key={moduleCode}
                >
                  <span className="font-bold text-app-text">
                    <i />
                    {moduleCode}
                  </span>
                  <span className="text-xs font-semibold">
                    Trending
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      }
      user={user}
    >
      <div className="groups-refresh space-y-6">
        <section className="app-hero groups-hero">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary-fixed-dim">
                Collaboration Hub
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                Study Groups
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">
                Create module-based groups, find partners, and keep study
                resources organized around the people learning with you.
              </p>
            </div>
            <button
              className={`groups-create-trigger shrink-0 ${
                showCreateForm ? "is-active" : ""
              }`}
              onClick={() => setShowCreateForm(!showCreateForm)}
              type="button"
            >
              <Icon name="plus" className="h-4 w-4" />
              New Group
            </button>
          </div>
        </section>

        {/* Create group form */}
        {showCreateForm && (
          <section className="groups-create-panel">
            <div className="groups-create-heading">
              <div>
                <p>Create together</p>
                <h2 className="mt-1 text-lg font-bold text-app-text">
                  Create a Study Group
                </h2>
              </div>
              <button
                aria-label="Close create group form"
                className="groups-form-close"
                onClick={() => setShowCreateForm(false)}
                type="button"
              >
                <Icon name="x" className="h-4 w-4" />
              </button>
            </div>

            {error && (
              <div className="groups-error mb-4 bg-red-50 p-3 text-sm font-semibold text-app-danger">
                {error}
              </div>
            )}

            <div className="groups-form-grid">
              <input
                className="app-input groups-input"
                onChange={(e) =>
                  setNewGroup({ ...newGroup, name: e.target.value })
                }
                placeholder="Group name (e.g. CS2103T Study Group)"
                value={newGroup.name}
              />
              <input
                className="app-input groups-input"
                onChange={(e) =>
                  setNewGroup({
                    ...newGroup,
                    module_code: e.target.value.toUpperCase(),
                  })
                }
                maxLength={20}
                placeholder="Module code only (e.g. MA1521) - optional"
                value={newGroup.module_code}
              />
              <p className="groups-form-helper text-xs font-semibold text-app-muted">
                Put the full module title in the group name or description.
                Module code is limited to 20 characters.
              </p>
              <textarea
                className="app-input groups-input groups-description-input h-28 resize-none"
                onChange={(e) =>
                  setNewGroup({ ...newGroup, description: e.target.value })
                }
                placeholder="Description - what is this group for?"
                value={newGroup.description}
              />
            </div>

            <div className="groups-form-actions mt-4 flex gap-2">
              <button
                className="groups-primary-button"
                disabled={creating}
                onClick={handleCreateGroup}
                type="button"
              >
                {creating ? (
                  <LoadingLabel>Creating group</LoadingLabel>
                ) : (
                  "Create Group"
                )}
              </button>
              <button
                className="groups-secondary-button"
                onClick={() => setShowCreateForm(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        {/* Groups list */}
        {loading ? (
          <LoadingState
            detail="Finding active groups and study partners."
            label="Loading study groups"
            rows={2}
            variant="feed"
          />
        ) : groups.length === 0 ? (
          <section className="app-empty-state groups-empty-state">
            <h2 className="text-xl font-bold text-app-text">No groups yet</h2>
            <p className="mt-2 text-sm text-app-muted">
              Create the first one and invite your classmates.
            </p>
            <button
              className="groups-primary-button mt-5"
              onClick={() => setShowCreateForm(true)}
              type="button"
            >
              Create a group
            </button>
          </section>
        ) : (
          <div className="groups-feed space-y-4">
            {groups.map((group) => (
              <Link
                className="group group-feed-card relative block overflow-hidden border border-slate-200 bg-white p-5 sm:p-6"
                key={group.id}
                to={`/groups/${group.id}`}
              >
                <div className="group-feed-layout flex flex-col gap-5 sm:flex-row sm:items-stretch sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      {group.module_code && (
                        <span className="group-module-ticket">
                          {group.module_code}
                        </span>
                      )}
                      <span className="group-creator-meta text-xs font-semibold text-app-muted">
                        Created by {group.creator_name || "Anonymous"}
                      </span>
                    </div>
                    <h2 className="group-feed-title mt-3 text-xl font-bold leading-snug text-app-text">
                      {group.name}
                    </h2>
                    {group.description && (
                      <p className="group-feed-description mt-2 text-sm leading-6 text-app-muted">
                        {group.description}
                      </p>
                    )}
                    <span className="group-open-link mt-5 inline-flex items-center gap-2 text-sm font-bold">
                      Open group
                      <span aria-hidden="true">↗</span>
                    </span>
                  </div>

                  <div className="group-member-signal flex shrink-0 items-center gap-3 sm:w-36 sm:flex-col sm:justify-center">
                    <span className="group-member-icon">
                      <Icon name="groups" className="h-5 w-5" />
                    </span>
                    <div className="text-left sm:text-center">
                    <div className="text-2xl font-bold text-primary">
                      {group.member_count}
                    </div>
                    <div className="text-xs font-semibold text-app-muted">
                      members
                    </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
