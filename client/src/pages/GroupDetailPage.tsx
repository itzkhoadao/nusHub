import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import AiAssistantCard from "../components/ui/AiAssistantCard";
import { apiUrl } from "../utils/api";

export default function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [groupData, setGroupData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [joining, setJoining] = useState(false);

  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchGroup = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(apiUrl(`/api/groups/${id}`), {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }); // request
        const data = await res.json(); // get response

        if (!res.ok) {
          // not successful, go back to groups page
          navigate("/groups");
          return;
        }

        setGroupData(data);

        // check if current user is already a member
        const alreadyMember = data.members.some((m) => m.id === user.id);
        setIsMember(alreadyMember);
      } catch (err) {
        console.error("Failed to fetch group:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchGroup();
  }, [id]);

  const handleJoinLeave = async () => {
    setJoining(true);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(apiUrl(`/api/groups/${id}/join`), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setIsMember(data.joined);

      // get the group we just handled
      const groupRes = await fetch(apiUrl(`/api/groups/${id}`));
      const groupData = await groupRes.json();
      setGroupData(groupData);
    } catch (err) {
      console.error("Failed to join/leave group:", err);
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <AppShell contextualPlaceholder="Search groups..." user={user}>
        <div className="app-card p-10 text-center text-app-muted">
          Loading group...
        </div>
      </AppShell>
    );
  }

  const { group, members } = groupData;

  return (
    <AppShell
      contextualPlaceholder="Search groups..."
      sidebar={
        <div className="space-y-4">
          <AiAssistantCard
            description="Ask for a study plan, summarize shared goals, or draft questions for your next session."
            title="Group Study Assistant"
          />

          <section className="app-section-card">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-app-muted">
              Group Snapshot
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="app-stat-card text-center">
                <div className="text-2xl font-bold text-primary">
                  {members.length}
                </div>
                <div className="text-xs font-semibold text-app-muted">
                  Members
                </div>
              </div>
              <div className="app-stat-card text-center">
                <div className="text-2xl font-bold text-primary">
                  {group.module_code || "-"}
                </div>
                <div className="text-xs font-semibold text-app-muted">
                  Module
                </div>
              </div>
            </div>
          </section>
        </div>
      }
      user={user}
    >
      <div className="space-y-6">
        <Link
          className="inline-flex items-center text-sm font-semibold text-app-muted hover:text-primary"
          to="/groups"
        >
          Back to groups
        </Link>

        {/* Group info card */}
        <section className="app-hero">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              {group.module_code && (
                <span className="app-badge bg-white/15 text-white">
                  {group.module_code}
                </span>
              )}
              <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                {group.name}
              </h1>
              {group.description && (
                <p className="mt-3 max-w-2xl text-sm leading-6 text-white/80">
                  {group.description}
                </p>
              )}
              <p className="mt-4 text-xs font-semibold text-primary-fixed-dim">
                Created by {group.creator_name || "Anonymous"} -{" "}
                {members.length} member{members.length !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Join/Leave button */}
            <button
              className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold shadow-sm transition-all hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 ${
                isMember
                  ? "bg-white text-app-danger hover:bg-red-50"
                  : "bg-secondary-container text-white hover:opacity-90"
              }`}
              disabled={joining}
              onClick={handleJoinLeave}
              type="button"
            >
              <Icon name="groups" className="h-4 w-4" />
              {joining ? "..." : isMember ? "Leave group" : "Join group"}
            </button>
          </div>
        </section>

        {/* Members list */}
        <section className="app-card overflow-hidden">
          <div className="border-b border-surface-variant px-5 py-4">
            <h2 className="text-lg font-bold text-app-text">
              Members ({members.length})
            </h2>
          </div>

          <div className="divide-y divide-surface-variant">
            {members.map((member) => {
              const profilePath =
                member.id === user.id ? "/profile" : `/users/${member.id}`;

              return (
                <div className="flex items-center gap-3 p-4 transition-colors hover:bg-primary-fixed/20" key={member.id}>
                  {/* Avatar circle */}
                  <Link
                    aria-label={`View ${member.username}'s profile`}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-sm font-bold text-primary shadow-sm ring-2 ring-white transition-all hover:-translate-y-0.5 hover:bg-primary hover:text-white"
                    to={profilePath}
                  >
                    {member.username.charAt(0).toUpperCase()}
                  </Link>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-app-text">
                    <Link
                      className="hover:text-primary hover:underline"
                      to={profilePath}
                    >
                      {member.username}
                    </Link>
                    {member.id === group.creator_id && (
                      <span className="app-badge bg-amber-50 text-amber-700">
                        Creator
                      </span>
                    )}
                    {member.id === user.id && (
                      <span className="app-badge bg-primary-fixed text-primary">
                        You
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-app-muted">
                    Joined {new Date(member.joined_at).toLocaleDateString()}
                  </p>
                </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
