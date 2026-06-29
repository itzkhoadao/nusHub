import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import TopicBadge from "../components/ui/TopicBadge";

function StatTile({ label, value, helper }) {
  return (
    <div className="app-stat-card">
      <div className="text-3xl font-bold tracking-tight text-primary">
        {value}
      </div>
      <div className="mt-1 text-xs font-bold uppercase tracking-wide text-app-muted">
        {label}
      </div>
      {helper && <p className="mt-2 text-xs text-app-muted">{helper}</p>}
    </div>
  );
}

function BadgePill({ label, tone = "blue" }) {
  const tones = {
    blue: "bg-primary-fixed text-primary",
    orange: "bg-secondary-fixed text-secondary",
    green: "bg-emerald-50 text-emerald-700",
  };

  return (
    <span className={`rounded-full px-3 py-1 text-xs font-bold ${tones[tone]}`}>
      {label}
    </span>
  );
}

function EmptyState({ title, body, action }) {
  return (
    <section className="app-empty-state">
      <h2 className="text-xl font-bold text-app-text">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-app-muted">
        {body}
      </p>
      {action}
    </section>
  );
}

export default function ProfilePage() {
  const [profileData, setProfileData] = useState(null);
  const [activeTab, setActiveTab] = useState("posts"); // switch between viewing posts and comments
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { userId } = useParams();

  const user = JSON.parse(localStorage.getItem("user"));
  const isOwnProfile = !userId || String(user?.id) === String(userId);

  // tell user to log in if they have not, if logged in, show their profile page
  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem("token");
        const url = isOwnProfile
          ? "http://localhost:5000/api/users/me"
          : `http://localhost:5000/api/users/${userId}`;

        const res = await fetch(url, {
          headers: isOwnProfile ? { Authorization: `Bearer ${token}` } : {},
        });

        const data = await res.json();
        if (!res.ok) {
          navigate("/");
          return;
        }
        setProfileData(data);
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  if (loading) {
    return (
      <AppShell user={user}>
        <div className="rounded-3xl border border-surface-variant bg-white p-10 text-center text-app-muted shadow-soft">
          Loading profile...
        </div>
      </AppShell>
    );
  }

  const {
    user: profileUser,
    posts,
    comments,
    groups = [],
  } = profileData;
  const upvotesReceived = posts.reduce(
    (sum, post) => sum + Number(post.upvotes || 0),
    0,
  );
  const contributions = posts.length + comments.length;
  const mostUsedTopic =
    posts.reduce((topics, post) => {
      topics[post.topic] = (topics[post.topic] || 0) + 1;
      return topics;
    }, {});
  const topTopic =
    Object.entries(mostUsedTopic).sort((a, b) => b[1] - a[1])[0]?.[0] ||
    "General";

  const tabs = [
    { id: "posts", label: "Posts", count: posts.length },
    { id: "comments", label: "Comments", count: comments.length },
    { id: "groups", label: "Groups", count: groups.length },
    { id: "topics", label: "Topics", count: 0 },
  ];

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/5">
          <div className="relative h-44 overflow-hidden bg-primary">
            <div className="absolute inset-0 bg-[linear-gradient(135deg,_#002754_0%,_#003d7c_45%,_#fd8614_140%)]" />
            <div className="absolute left-8 top-8 rounded-full bg-white/15 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">
              NUSHub Profile
            </div>
            <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/30 to-transparent" />
          </div>

          <div className="px-6 py-6 md:px-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 flex-col gap-5 md:flex-row md:items-start">
                <div className="relative shrink-0">
                  <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-primary text-4xl font-bold text-white shadow-raised">
                    {profileUser.username.charAt(0).toUpperCase()}
                  </div>
                  <div className="absolute bottom-2 right-2 h-5 w-5 rounded-full border-4 border-white bg-emerald-500" />
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="break-words text-3xl font-bold tracking-tight text-primary md:text-4xl">
                      {profileUser.username}
                    </h1>
                    <BadgePill label="Member" tone="orange" />
                  </div>
                  <p className="mt-2 text-sm font-semibold text-app-muted">
                    {profileUser.email}
                  </p>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-app-muted">
                    Active NUSHub contributor since{" "}
                    {new Date(profileUser.created_at).toLocaleDateString()}.
                    Most active around <span className="font-bold">{topTopic}</span>.
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap gap-3">
                {isOwnProfile && (
                  <button
                    className="app-button-primary px-5 py-3"
                    type="button"
                  >
                    Edit Profile
                  </button>
                )}
                <button
                  aria-label="Share profile"
                  className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white text-primary shadow-sm ring-1 ring-slate-900/5 transition-all hover:-translate-y-0.5 hover:bg-primary hover:text-white"
                  type="button"
                >
                  <Icon name="share" className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                helper="Posts started"
                label="Threads"
                value={posts.length}
              />
              <StatTile
                helper="Replies written"
                label="Comments"
                value={comments.length}
              />
              <StatTile
                helper="From your posts"
                label="Upvotes"
                value={upvotesReceived}
              />
              <StatTile
                helper="Posts + comments"
                label="Contributions"
                value={contributions}
              />
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            <section className="rounded-lg border border-slate-200 bg-white p-1.5 shadow-sm ring-1 ring-slate-900/5">
              <div className="grid gap-1 sm:grid-cols-4">
                {tabs.map((tab) => (
                  <button
                    className={`rounded-xl px-4 py-3 text-sm font-bold transition-colors ${
                      activeTab === tab.id
                        ? "bg-primary text-white shadow-sm"
                        : "text-app-muted hover:bg-primary-fixed/40 hover:text-primary"
                    }`}
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    type="button"
                  >
                    {tab.label} ({tab.count})
                  </button>
                ))}
              </div>
            </section>

            {activeTab === "posts" &&
              (posts.length === 0 ? (
                <EmptyState
                  action={
                    <Link className="app-button-primary mt-5" to="/create-post">
                      Create your first post
                    </Link>
                  }
                  body="Your posts will appear here after you start a discussion."
                  title="No posts yet"
                />
              ) : (
                <div className="space-y-4">
                  {posts.map((post) => (
                    <Link
                      className="group block rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/5 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_18px_44px_rgba(0,39,84,0.10)]"
                      key={post.id}
                      to={`/posts/${post.id}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <TopicBadge topic={post.topic} />
                            <span className="text-xs font-semibold text-app-muted">
                              {new Date(post.created_at).toLocaleDateString()}
                            </span>
                          </div>
                          <h2 className="mt-3 text-xl font-bold leading-snug text-app-text group-hover:text-primary">
                            {post.is_anonymous
                              ? "Posted anonymously"
                              : post.title}
                          </h2>
                        </div>
                        <div className="flex shrink-0 flex-col items-center rounded-2xl bg-primary-fixed px-3 py-2 text-primary">
                          <Icon name="chevronUp" className="h-4 w-4" />
                          <span className="text-sm font-bold">{post.upvotes}</span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}

            {activeTab === "comments" &&
              (comments.length === 0 ? (
                <EmptyState
                  body="Your replies will appear here after you join a discussion."
                  title="No comments yet"
                />
              ) : (
                <div className="space-y-4">
                  {comments.map((comment) => (
                    <Link
                      className="group block rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/5 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_18px_44px_rgba(0,39,84,0.10)]"
                      key={comment.id}
                      to={`/posts/${comment.post_id}`}
                    >
                      <p className="text-sm leading-6 text-app-text">
                        {comment.is_anonymous
                          ? "Commented anonymously"
                          : comment.content}
                      </p>
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-app-muted">
                        <span>on: {comment.post_title}</span>
                        <span>{new Date(comment.created_at).toLocaleDateString()}</span>
                        <span className="flex items-center gap-1 text-primary">
                          <Icon name="chevronUp" className="h-4 w-4" />
                          {comment.upvotes}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}

            {activeTab === "groups" &&
              (groups.length === 0 ? (
                <EmptyState
                  action={
                    <Link className="app-button-primary mt-5" to="/groups">
                      Browse Study Groups
                    </Link>
                  }
                  body={
                    isOwnProfile
                      ? "Study groups you join will appear here."
                      : "This user has not joined any study groups yet."
                  }
                  title="No joined groups yet"
                />
              ) : (
                <div className="space-y-4">
                  {groups.map((group) => (
                    <Link
                      className="group block rounded-lg border border-slate-200 bg-white p-5 shadow-[0_14px_34px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/5 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_18px_44px_rgba(0,39,84,0.10)]"
                      key={group.id}
                      to={`/groups/${group.id}`}
                    >
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {group.module_code && (
                              <span className="app-badge bg-emerald-50 text-emerald-700">
                                {group.module_code}
                              </span>
                            )}
                            <span className="text-xs font-semibold text-app-muted">
                              Joined {new Date(group.joined_at).toLocaleDateString()}
                            </span>
                          </div>
                          <h2 className="mt-3 text-xl font-bold leading-snug text-app-text group-hover:text-primary">
                            {group.name}
                          </h2>
                          {group.description && (
                            <p className="mt-2 line-clamp-2 text-sm leading-6 text-app-muted">
                              {group.description}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2 rounded-2xl bg-primary-fixed px-3 py-2 text-sm font-bold text-primary">
                          <Icon name="groups" className="h-4 w-4" />
                          {group.member_count} member
                          {Number(group.member_count) !== 1 ? "s" : ""}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ))}

            {activeTab === "topics" && (
              <EmptyState
                body="Topic-following is not stored by the backend yet, so this is a placeholder for a future feature."
                title="Followed topics are coming soon"
              />
            )}
          </div>

          <aside className="space-y-4">
            <section className="app-section-card">
              <h2 className="text-sm font-bold uppercase tracking-wide text-app-muted">
                Community Badges
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                <BadgePill label="Early Contributor" />
                <BadgePill label="Helpful" tone="green" />
                <BadgePill label={topTopic} tone="orange" />
              </div>
            </section>

            <section className="app-section-card">
              <h2 className="text-sm font-bold uppercase tracking-wide text-app-muted">
                Activity Mix
              </h2>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-1 flex justify-between text-xs font-bold text-app-muted">
                    <span>Posts</span>
                    <span>{posts.length}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-low">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${contributions ? (posts.length / contributions) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs font-bold text-app-muted">
                    <span>Comments</span>
                    <span>{comments.length}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-low">
                    <div
                      className="h-full rounded-full bg-secondary-container"
                      style={{
                        width: `${contributions ? (comments.length / contributions) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
