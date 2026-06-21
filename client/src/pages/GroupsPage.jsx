import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import AiAssistantCard from "../components/ui/AiAssistantCard";

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

  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchGroups = async () => {
      setLoading(true);

      try {
        let url = "http://localhost:5000/api/groups";
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

    setCreating(true);
    setError("");

    try {
      const token = localStorage.getItem("token");

      // HTTP post request
      const res = await fetch("http://localhost:5000/api/groups", {
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
      setError("Something went wrong:", err);
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
      sidebar={
        <div className="space-y-4">
          <AiAssistantCard
            description="Find study partners, summarize group resources, or ask for module planning ideas."
            title="AI Study Assistant"
          />

          <section className="app-card p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-app-muted">
              Active Study Areas
            </h2>
            <div className="space-y-3 text-sm">
              {["CS2040S", "CS2103T", "MA1521"].map((moduleCode) => (
                <div
                  className="flex items-center justify-between rounded-lg bg-surface-low p-3"
                  key={moduleCode}
                >
                  <span className="font-bold text-app-text">{moduleCode}</span>
                  <span className="text-xs font-semibold text-app-muted">
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
      <div className="space-y-6">
        <section className="rounded-2xl bg-primary px-6 py-7 text-white shadow-soft">
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
              className="app-button-secondary shrink-0"
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
          <section className="app-card p-5">
            <h2 className="mb-4 text-lg font-bold text-app-text">
              Create a Study Group
            </h2>

            {error && (
              <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm font-semibold text-app-danger">
                {error}
              </div>
            )}

            <div className="space-y-3">
              <input
                className="app-input"
                onChange={(e) =>
                  setNewGroup({ ...newGroup, name: e.target.value })
                }
                placeholder="Group name (e.g. CS2103T Study Group)"
                value={newGroup.name}
              />
              <input
                className="app-input"
                onChange={(e) =>
                  setNewGroup({ ...newGroup, module_code: e.target.value })
                }
                placeholder="Module code (e.g. CS2103T) - optional"
                value={newGroup.module_code}
              />
              <textarea
                className="app-input h-28 resize-none"
                onChange={(e) =>
                  setNewGroup({ ...newGroup, description: e.target.value })
                }
                placeholder="Description - what is this group for?"
                value={newGroup.description}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                className="app-button-primary"
                disabled={creating}
                onClick={handleCreateGroup}
                type="button"
              >
                {creating ? "Creating..." : "Create Group"}
              </button>
              <button
                className="app-button-ghost"
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
          <div className="space-y-4">
            {[1, 2].map((item) => (
              <div className="app-card animate-pulse p-5" key={item}>
                <div className="mb-4 h-4 w-20 rounded bg-surface-high" />
                <div className="mb-3 h-5 w-1/2 rounded bg-surface-high" />
                <div className="h-4 w-2/3 rounded bg-surface-high" />
              </div>
            ))}
          </div>
        ) : groups.length === 0 ? (
          <section className="app-card p-10 text-center">
            <h2 className="text-xl font-bold text-app-text">No groups yet</h2>
            <p className="mt-2 text-sm text-app-muted">
              Create the first one and invite your classmates.
            </p>
            <button
              className="app-button-primary mt-5"
              onClick={() => setShowCreateForm(true)}
              type="button"
            >
              Create a group
            </button>
          </section>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {groups.map((group) => (
              <Link
                className="app-card app-card-hover block p-5"
                key={group.id}
                to={`/groups/${group.id}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    {group.module_code && (
                      <span className="app-badge bg-emerald-50 text-emerald-700">
                        {group.module_code}
                      </span>
                    )}
                    <h2 className="mt-3 text-lg font-bold leading-snug text-app-text">
                      {group.name}
                    </h2>
                    {group.description && (
                      <p className="mt-2 line-clamp-2 text-sm leading-6 text-app-muted">
                        {group.description}
                      </p>
                    )}
                    <p className="mt-3 text-xs font-semibold text-app-muted">
                      Created by {group.creator_name || "Anonymous"}
                    </p>
                  </div>

                  <div className="rounded-xl bg-surface-low px-4 py-3 text-center">
                    <div className="text-2xl font-bold text-primary">
                      {group.member_count}
                    </div>
                    <div className="text-xs font-semibold text-app-muted">
                      members
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
