import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import AiAssistantCard from "../components/ui/AiAssistantCard";
import UserAvatar from "../components/ui/UserAvatar";
import LoadingState, { LoadingLabel } from "../components/ui/LoadingState";
import { apiUrl } from "../utils/api";
import { getAuthToken, getStoredUser } from "../utils/authStorage";

export default function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [groupData, setGroupData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [joining, setJoining] = useState(false);

  const user = getStoredUser();

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchGroup = async () => {
      try {
        const token = getAuthToken();
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
      const token = getAuthToken();
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
        <LoadingState
          detail="Preparing the group overview and member roster."
          label="Loading study group"
        />
      </AppShell>
    );
  }

  const { group, members } = groupData;

  return (
    <AppShell
      contextualPlaceholder="Search groups..."
      sidebarSize="compact"
      sidebar={
        <div className="forum-sidebar-stack group-detail-sidebar space-y-4">
          <AiAssistantCard
            description="Ask for a study plan, summarize shared goals, or draft questions for your next session."
            title="Group Study Assistant"
          />

          <section className="app-section-card forum-recent-panel group-detail-snapshot">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-app-muted">
              Group Snapshot
            </h2>
            <div className="space-y-3">
              <div className="group-detail-snapshot-row">
                <span className="group-detail-snapshot-icon">
                  <Icon name="groups" className="h-4 w-4" />
                </span>
                <div>
                  <strong>{members.length}</strong>
                  <span>Members</span>
                </div>
              </div>
              <div className="group-detail-snapshot-row">
                <span className="group-detail-snapshot-icon">
                  <Icon name="post" className="h-4 w-4" />
                </span>
                <div>
                  <strong>{group.module_code || "General"}</strong>
                  <span>Module</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      }
      user={user}
    >
      <div className="group-detail-refresh space-y-6">
        <Link
          className="group-detail-back inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold"
          to="/groups"
        >
          <Icon name="arrowLeft" className="h-4 w-4" />
          <span>Back to groups</span>
        </Link>

        {/* Group info card */}
        <section className="app-hero group-detail-hero">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              {group.module_code && (
                <span className="group-detail-module-ticket">
                  {group.module_code}
                </span>
              )}
              <h1 className="group-detail-title mt-3 text-3xl font-bold tracking-tight md:text-4xl">
                {group.name}
              </h1>
              {group.description && (
                <p className="group-detail-description mt-3 max-w-3xl text-sm leading-6 text-white/80">
                  {group.description}
                </p>
              )}
              <div className="group-detail-meta mt-5 flex flex-wrap items-center gap-3 text-xs font-semibold">
                <span>Created by {group.creator_name || "Anonymous"}</span>
                <span>{members.length} member{members.length !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {/* Join/Leave button */}
            <button
              className={`group-detail-membership-button inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2 text-sm font-bold ${
                isMember ? "is-member" : ""
              }`}
              disabled={joining}
              onClick={handleJoinLeave}
              type="button"
            >
              <Icon name="groups" className="h-4 w-4" />
              {joining ? (
                <LoadingLabel>
                  {isMember ? "Leaving" : "Joining"}
                </LoadingLabel>
              ) : isMember ? (
                "Leave group"
              ) : (
                "Join group"
              )}
            </button>
          </div>
        </section>

        {/* Members list */}
        <section className="group-detail-members overflow-hidden">
          <div className="group-detail-members-heading flex items-center justify-between gap-4 border-b border-surface-variant px-5 py-4">
            <h2 className="text-lg font-bold text-app-text">
              Members
            </h2>
            <span>{members.length}</span>
          </div>

          <div className="group-detail-member-list">
            {members.map((member) => {
              const profilePath =
                member.id === user.id ? "/profile" : `/users/${member.id}`;

              return (
                <div
                  className="group-detail-member-row flex items-center gap-3 p-4"
                  key={member.id}
                >
                  {/* Avatar circle */}
                  <Link
                    aria-label={`View ${member.username}'s profile`}
                    className="group-detail-member-avatar"
                    to={profilePath}
                  >
                    <UserAvatar
                      avatarUrl={member.avatar_url}
                      className="h-10 w-10 text-sm"
                      name={member.username}
                      rounded="lg"
                      userId={member.id}
                    />
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
                      <span className="group-detail-role-badge is-creator">
                        Creator
                      </span>
                    )}
                    {member.id === user.id && (
                      <span className="group-detail-role-badge is-you">
                        You
                      </span>
                    )}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-app-muted">
                    Joined {new Date(member.joined_at).toLocaleDateString()}
                  </p>
                </div>
                  <span className="group-detail-member-status">
                    {member.id === group.creator_id ? "Group lead" : "Member"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
