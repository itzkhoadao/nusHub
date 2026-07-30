import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import TopicBadge from "../components/ui/TopicBadge";
import UserAvatar from "../components/ui/UserAvatar";
import LoadingState, { LoadingLabel } from "../components/ui/LoadingState";
import { apiUrl } from "../utils/api";
import {
  getAuthToken,
  getStoredUser,
  updateStoredUser,
} from "../utils/authStorage";
import {
  removeProfileAvatar,
  removeProfileCover,
  updateProfileAvatar,
  updateProfileCover,
  updateProfileDetails,
  validateAvatarFile,
  validateCoverFile,
} from "../utils/profileApi";
import {
  conversationsKey,
  getCurrentUserId,
  startDirectConversation,
  type Conversation,
} from "../utils/chatApi";

const FACULTY_ABBREVIATIONS: Record<string, string> = {
  "Faculty of Arts & Social Sciences": "FASS",
  "NUS Business School": "Biz",
  "School of Computing": "SoC",
  "School of Continuing & Lifelong Education": "SCALE",
  "Faculty of Dentistry": "FoD",
  "College of Design and Engineering": "CDE",
  "Duke-NUS Medical School": "Duke-NUS",
  "College of Humanities and Sciences": "CHS",
  "NUS College": "NUSC",
  "NUS Graduate School": "NUS GS",
  "Faculty of Law": "Law",
  "Yong Loo Lin School of Medicine (including Nursing)": "YLLSoM",
  "Yong Siew Toh Conservatory of Music": "YST",
  "Saw Swee Hock School of Public Health": "SSHSPH",
  "Lee Kuan Yew School of Public Policy": "LKYSPP",
  "Faculty of Science": "FoS",
  "Institute of Systems Science": "NUS-ISS",
};

function StatTile({ label, value, helper }) {
  return (
    <div className="app-stat-card profile-stat-tile">
      <div className="profile-stat-value text-3xl font-bold tracking-tight text-primary">
        {value}
      </div>
      <div className="profile-stat-label mt-1 text-xs font-bold uppercase tracking-wide text-app-muted">
        {label}
      </div>
      {helper && (
        <p className="profile-stat-helper mt-2 text-xs text-app-muted">
          {helper}
        </p>
      )}
    </div>
  );
}

function BadgePill({ label, title = undefined, tone = "blue" }) {
  const tones = {
    blue: "bg-primary-fixed text-primary",
    orange: "bg-secondary-fixed text-secondary",
    green: "bg-emerald-50 text-emerald-700",
    purple: "bg-violet-50 text-violet-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <span
      className={`profile-badge-ticket px-3 py-1 text-xs font-bold ${tones[tone]}`}
      title={title}
    >
      {label}
    </span>
  );
}

function EmptyState({ title, body, action = null }) {
  return (
    <section className="app-empty-state profile-empty-state">
      <h2 className="text-xl font-bold text-app-text">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-app-muted">
        {body}
      </p>
      {action}
    </section>
  );
}

function ProfileAvatar({ user, className = "h-24 w-24 text-4xl" }) {
  return (
    <UserAvatar
      avatarUrl={user.avatar_url}
      className={`${className} shadow-raised`}
      name={user.username}
      rounded="3xl"
      userId={user.id}
    />
  );
}

export default function ProfilePage() {
  const [profileData, setProfileData] = useState(null);
  const [activeTab, setActiveTab] = useState("posts"); // switch between viewing posts and comments
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);
  const [chatError, setChatError] = useState("");
  const [isAvatarViewerOpen, setIsAvatarViewerOpen] = useState(false);
  const [isEditProfileModalOpen, setIsEditProfileModalOpen] = useState(false);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [selectedAvatarFile, setSelectedAvatarFile] = useState<File | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [avatarAction, setAvatarAction] = useState<"save" | "remove" | null>(
    null,
  );
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [isCoverModalOpen, setIsCoverModalOpen] = useState(false);
  const [selectedCoverFile, setSelectedCoverFile] = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState("");
  const [coverError, setCoverError] = useState("");
  const [coverSaving, setCoverSaving] = useState(false);
  const [coverAction, setCoverAction] = useState<"save" | "remove" | null>(
    null,
  );
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [profileFieldEditor, setProfileFieldEditor] = useState<
    "username" | "bio" | null
  >(null);
  const [profileFieldValue, setProfileFieldValue] = useState("");
  const [profileFieldError, setProfileFieldError] = useState("");
  const [profileFieldSaving, setProfileFieldSaving] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { userId } = useParams();

  const user = getStoredUser();
  const isOwnProfile = !userId || String(user?.id) === String(userId);

  // tell user to log in if they have not, if logged in, show their profile page
  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchProfile = async () => {
      try {
        const token = getAuthToken();
        const url = isOwnProfile
          ? apiUrl("/api/users/me")
          : apiUrl(`/api/users/${userId}`);

        const res = await fetch(url, {
          headers: isOwnProfile ? { Authorization: `Bearer ${token}` } : {},
        });

        const data = await res.json();
        if (!res.ok) {
          navigate("/");
          return;
        }
        setProfileData(data);
        if (isOwnProfile) {
          updateStoredUser(data.user);
        }
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [userId]);

  useEffect(() => {
    return () => {
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
    };
  }, [avatarPreviewUrl]);

  useEffect(() => {
    return () => {
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    };
  }, [coverPreviewUrl]);

  useEffect(() => {
    if (!isAvatarViewerOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsAvatarViewerOpen(false);
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAvatarViewerOpen]);

  if (loading) {
    return (
      <AppShell user={user}>
        <LoadingState
          detail="Gathering contributions, groups, and community activity."
          label="Loading profile"
        />
      </AppShell>
    );
  }

  const { user: profileUser, posts, comments, groups = [] } = profileData;
  const shellUser = isOwnProfile ? profileUser : user;
  const upvotesReceived = posts.reduce(
    (sum, post) => sum + Number(post.upvotes || 0),
    0,
  );
  const contributions = posts.length + comments.length;

  // Record<string, number>: An object where every key is a string, and every value is a number
  // Example, Housing: 6
  const mostUsedTopic = posts.reduce(
    (topics, post) => {
      topics[post.topic] = (topics[post.topic] || 0) + 1;
      return topics;
    },
    {} as Record<string, number>,
  );

  // If there's a top topic, return it, otherwise just return General
  const topTopic =
    (Object.entries(mostUsedTopic) as [string, number][]).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0] || "General";

  const profileBadges = [
    ...(profileUser.academic_year && profileUser.academic_year !== "None"
      ? [{ label: profileUser.academic_year, tone: "blue" }]
      : []),
    ...(profileUser.is_teaching_assistant
      ? [{ label: "Teaching Assistant", tone: "green" }]
      : []),
    ...(profileUser.is_professor
      ? [{ label: "Professor", tone: "purple" }]
      : []),
    ...(
      profileUser.faculties?.length
        ? profileUser.faculties
        : profileUser.faculty
          ? [profileUser.faculty]
          : []
    ).map((faculty) => ({
      label: FACULTY_ABBREVIATIONS[faculty] || faculty,
      title: faculty,
      tone: "slate",
    })),
  ];

  const tabs = [
    { id: "posts", label: "Posts", count: posts.length },
    { id: "comments", label: "Comments", count: comments.length },
    { id: "groups", label: "Groups", count: groups.length },
    { id: "topics", label: "Topics", count: 0 },
  ];

  const updateProfileUser = (nextUser) => {
    setProfileData((currentData) => {
      if (!currentData) return currentData;
      const mergedUser = { ...currentData.user, ...nextUser };
      if (isOwnProfile) updateStoredUser(mergedUser);
      return { ...currentData, user: mergedUser };
    });
  };

  const resetAvatarModal = () => {
    setIsAvatarModalOpen(false);
    setSelectedAvatarFile(null);
    if (avatarPreviewUrl) {
      URL.revokeObjectURL(avatarPreviewUrl);
    }
    setAvatarPreviewUrl("");
    setAvatarError("");

    if (avatarInputRef.current) {
      avatarInputRef.current.value = "";
    }
  };

  const openAvatarEditor = () => {
    setIsEditProfileModalOpen(false);
    setIsAvatarModalOpen(true);
  };

  const handleAvatarFileChange = (file: File | null) => {
    if (!file) {
      return;
    }

    try {
      validateAvatarFile(file);
      if (avatarPreviewUrl) {
        URL.revokeObjectURL(avatarPreviewUrl);
      }
      setSelectedAvatarFile(file);
      setAvatarPreviewUrl(URL.createObjectURL(file));
      setAvatarError("");
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Invalid avatar");
    }
  };

  const handleSaveAvatar = async () => {
    if (!selectedAvatarFile || avatarSaving) {
      return;
    }

    setAvatarSaving(true);
    setAvatarAction("save");
    setAvatarError("");

    try {
      const result = await updateProfileAvatar(selectedAvatarFile);
      updateProfileUser(result.user);
      resetAvatarModal();
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : "Failed to update avatar",
      );
    } finally {
      setAvatarSaving(false);
      setAvatarAction(null);
    }
  };

  const handleRemoveAvatar = async () => {
    if (avatarSaving) {
      return;
    }

    setAvatarSaving(true);
    setAvatarAction("remove");
    setAvatarError("");

    try {
      const result = await removeProfileAvatar();
      updateProfileUser(result.user);
      resetAvatarModal();
    } catch (err) {
      setAvatarError(
        err instanceof Error ? err.message : "Failed to remove avatar",
      );
    } finally {
      setAvatarSaving(false);
      setAvatarAction(null);
    }
  };

  const resetCoverModal = () => {
    setIsCoverModalOpen(false);
    setSelectedCoverFile(null);
    if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
    setCoverPreviewUrl("");
    setCoverError("");
    if (coverInputRef.current) coverInputRef.current.value = "";
  };

  const openCoverEditor = () => {
    setIsEditProfileModalOpen(false);
    setIsCoverModalOpen(true);
  };

  const handleCoverFileChange = (file: File | null) => {
    if (!file) return;
    try {
      validateCoverFile(file);
      if (coverPreviewUrl) URL.revokeObjectURL(coverPreviewUrl);
      setSelectedCoverFile(file);
      setCoverPreviewUrl(URL.createObjectURL(file));
      setCoverError("");
    } catch (err) {
      setCoverError(
        err instanceof Error ? err.message : "Invalid cover picture",
      );
    }
  };

  const handleSaveCover = async () => {
    if (!selectedCoverFile || coverSaving) return;
    setCoverSaving(true);
    setCoverAction("save");
    setCoverError("");
    try {
      const result = await updateProfileCover(selectedCoverFile);
      updateProfileUser(result.user);
      resetCoverModal();
    } catch (err) {
      setCoverError(
        err instanceof Error ? err.message : "Failed to update cover picture",
      );
    } finally {
      setCoverSaving(false);
      setCoverAction(null);
    }
  };

  const handleRemoveCover = async () => {
    if (coverSaving) return;
    setCoverSaving(true);
    setCoverAction("remove");
    setCoverError("");
    try {
      const result = await removeProfileCover();
      updateProfileUser(result.user);
      resetCoverModal();
    } catch (err) {
      setCoverError(
        err instanceof Error ? err.message : "Failed to remove cover picture",
      );
    } finally {
      setCoverSaving(false);
      setCoverAction(null);
    }
  };

  const openProfileFieldEditor = (field: "username" | "bio") => {
    setIsEditProfileModalOpen(false);
    setProfileFieldEditor(field);
    setProfileFieldValue(
      field === "username" ? profileUser.username : profileUser.bio || "",
    );
    setProfileFieldError("");
  };

  const closeProfileFieldEditor = () => {
    if (profileFieldSaving) return;
    setProfileFieldEditor(null);
    setProfileFieldValue("");
    setProfileFieldError("");
  };

  const handleSaveProfileField = async () => {
    if (!profileFieldEditor || profileFieldSaving) return;
    const value = profileFieldValue.trim();

    if (
      profileFieldEditor === "username" &&
      !/^[A-Za-z0-9_]{3,24}$/.test(value)
    ) {
      setProfileFieldError(
        "Use 3–24 letters, numbers, or underscores.",
      );
      return;
    }
    if (profileFieldEditor === "bio" && value.length > 160) {
      setProfileFieldError("Bio must be 160 characters or fewer.");
      return;
    }

    setProfileFieldSaving(true);
    setProfileFieldError("");
    try {
      const result = await updateProfileDetails({
        [profileFieldEditor]: value,
      });
      updateProfileUser(result.user);
      setProfileFieldEditor(null);
      setProfileFieldValue("");
    } catch (err) {
      setProfileFieldError(
        err instanceof Error ? err.message : "Failed to update profile",
      );
    } finally {
      setProfileFieldSaving(false);
    }
  };

  // start direct chat with another user
  const handleStartChat = async () => {
    if (!profileUser?.id || startingChat) {
      return;
    }

    setStartingChat(true);
    setChatError("");

    try {
      const conversation = await startDirectConversation(profileUser.id);
      const currentUserId = getCurrentUserId();

      if (currentUserId) {
        queryClient.setQueryData<Conversation[]>(
          conversationsKey(currentUserId),
          (currentConversations = []) => {
            // if there's already a conversation between the 2 users, don't change anything
            if (currentConversations.some((item) => item.id === conversation.id)) {
              return currentConversations;
            }

            return [conversation, ...currentConversations]; // chat not exist => add to array
          },
        );
      }

      navigate(`/chat/${conversation.id}`);
    } catch (err) {
      setChatError(
        err instanceof Error ? err.message : "Failed to start chat",
      );
    } finally {
      setStartingChat(false);
    }
  };

  return (
    <AppShell user={shellUser}>
      <div className="profile-refresh mx-auto max-w-6xl space-y-8">
        <section className="profile-identity-card overflow-hidden border border-slate-200 bg-white">
          <div className="profile-cover relative h-44 overflow-hidden bg-primary">
            {profileUser.cover_url ? (
              <img
                alt={`${profileUser.username}'s cover`}
                className="profile-cover-image absolute inset-0 h-full w-full object-cover"
                src={profileUser.cover_url}
              />
            ) : (
              <>
                <div className="absolute inset-0 bg-[linear-gradient(135deg,_#002754_0%,_#003d7c_45%,_#fd8614_140%)]" />
                <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
              </>
            )}
            <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-black/30 to-transparent" />
          </div>

          <div className="profile-identity-content px-6 py-6 md:px-8">
            <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 flex-col gap-5 md:flex-row md:items-start">
                <div className="profile-avatar-stage relative shrink-0">
                  <button
                    aria-label={`View ${profileUser.username}'s profile photo`}
                    className="profile-avatar-trigger"
                    onClick={() => setIsAvatarViewerOpen(true)}
                    type="button"
                  >
                    <ProfileAvatar user={profileUser} />
                    <span className="profile-avatar-view-hint" aria-hidden="true">
                      <Icon name="camera" className="h-4 w-4" />
                      View
                    </span>
                  </button>
                </div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <h1 className="profile-username break-words text-3xl font-bold tracking-tight text-primary md:text-4xl">
                      {profileUser.username}
                    </h1>
                    {profileBadges.map((badge) => (
                      <BadgePill
                        key={`${badge.label}-${badge.tone}`}
                        label={badge.label}
                        title={badge.title}
                        tone={badge.tone}
                      />
                    ))}
                  </div>
                  {profileUser.bio ? (
                    <p className="profile-bio mt-3 max-w-2xl whitespace-pre-wrap text-sm leading-6 text-app-muted">
                      {profileUser.bio}
                    </p>
                  ) : isOwnProfile ? (
                    <button
                      className="mt-3 text-sm font-bold text-secondary transition-colors hover:text-orange-600 hover:underline"
                      onClick={() => openProfileFieldEditor("bio")}
                      type="button"
                    >
                      Add bio!
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="profile-actions flex shrink-0 flex-wrap gap-3">
                {isOwnProfile && (
                  <button
                    className="profile-action-primary px-5 py-3"
                    onClick={() => setIsEditProfileModalOpen(true)}
                    type="button"
                  >
                    Edit Profile
                  </button>
                )}
                {!isOwnProfile && (
                  <button
                    aria-label={`Chat with ${profileUser.username}`}
                    className="profile-action-secondary flex h-11 items-center justify-center gap-2 px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={startingChat}
                    onClick={handleStartChat} // click on button => start chat
                    type="button"
                  >
                    {startingChat ? (
                      <LoadingLabel>Opening chat</LoadingLabel>
                    ) : (
                      <>
                        <Icon name="message" className="h-5 w-5" />
                        <span>Chat</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  aria-label="Share profile"
                  className="profile-action-icon flex h-11 w-11 items-center justify-center"
                  type="button"
                >
                  <Icon name="share" className="h-5 w-5" />
                </button>
              </div>
            </div>

            {chatError && (
              <div className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-app-danger">
                {chatError}
              </div>
            )}

            <div className="profile-stats-grid mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            <section className="profile-tab-shell">
              <div className="grid gap-1 sm:grid-cols-4">
                {tabs.map((tab) => (
                  <button
                    className={`profile-tab-button px-4 py-3 text-sm font-bold ${
                      activeTab === tab.id ? "is-active" : ""
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
                      className="profile-contribution-card group block border border-slate-200 bg-white p-5"
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
                        <div className="profile-score-chip flex shrink-0 flex-col items-center px-3 py-2 text-primary">
                          <Icon name="chevronUp" className="h-4 w-4" />
                          <span className="text-sm font-bold">
                            {post.upvotes}
                          </span>
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
                      className="profile-contribution-card group block border border-slate-200 bg-white p-5"
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
                        <span>
                          {new Date(comment.created_at).toLocaleDateString()}
                        </span>
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
                      className="profile-contribution-card group block border border-slate-200 bg-white p-5"
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
                              Joined{" "}
                              {new Date(group.joined_at).toLocaleDateString()}
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
                        <div className="profile-score-chip flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-bold text-primary">
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
            <section className="app-section-card profile-side-card">
              <h2 className="text-sm font-bold uppercase tracking-wide text-app-muted">
                Community Badges
              </h2>
              <div className="mt-4 flex flex-wrap gap-2">
                <BadgePill label="Early Contributor" />
                <BadgePill label="Helpful" tone="green" />
                <BadgePill label={topTopic} tone="orange" />
              </div>
            </section>

            <section className="app-section-card profile-side-card">
              <h2 className="text-sm font-bold uppercase tracking-wide text-app-muted">
                Activity Mix
              </h2>
              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-1 flex justify-between text-xs font-bold text-app-muted">
                    <span>Posts</span>
                    <span>{posts.length}</span>
                  </div>
                  <div className="profile-activity-track h-2 overflow-hidden bg-surface-low">
                    <div
                      className="profile-activity-fill h-full bg-primary"
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
                  <div className="profile-activity-track h-2 overflow-hidden bg-surface-low">
                    <div
                      className="profile-activity-fill h-full bg-secondary-container"
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

      {isAvatarViewerOpen && (
        <div
          className="profile-avatar-lightbox"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setIsAvatarViewerOpen(false);
            }
          }}
          role="presentation"
        >
          <section
            aria-label={`${profileUser.username}'s profile photo`}
            aria-modal="true"
            className="profile-avatar-lightbox-dialog"
            role="dialog"
          >
            <button
              aria-label="Close profile photo"
              autoFocus
              className="profile-avatar-lightbox-close"
              onClick={() => setIsAvatarViewerOpen(false)}
              type="button"
            >
              <Icon name="x" className="h-6 w-6" />
            </button>

            <div className="profile-avatar-lightbox-media">
              {profileUser.avatar_url ? (
                <img
                  alt={`${profileUser.username}'s profile photo`}
                  src={profileUser.avatar_url}
                />
              ) : (
                <div className="profile-avatar-lightbox-fallback">
                  {profileUser.username.charAt(0).toUpperCase()}
                </div>
              )}
            </div>

            <p className="profile-avatar-lightbox-caption">
              @{profileUser.username}
            </p>
          </section>
        </div>
      )}

      {isEditProfileModalOpen && (
        <div className="profile-editor-overlay">
          <section
            aria-labelledby="profile-editor-title"
            aria-modal="true"
            className="profile-editor-shell profile-editor-shell--hub"
            role="dialog"
          >
            <div className="profile-editor-ambient" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>

            <header className="profile-editor-header">
              <div>
                <p className="profile-editor-eyebrow">Profile studio</p>
                <h2 className="profile-editor-title" id="profile-editor-title">
                  Shape how NUSHub sees you.
                </h2>
                <p className="profile-editor-copy">
                  Fine-tune your identity, story, and campus details.
                </p>
              </div>
              <button
                aria-label="Close profile editor"
                className="profile-editor-close"
                onClick={() => setIsEditProfileModalOpen(false)}
                type="button"
              >
                <Icon name="x" className="h-5 w-5" />
              </button>
            </header>

            <div className="profile-editor-choices">
              <button
                className="profile-editor-choice is-1"
                onClick={openAvatarEditor}
                type="button"
              >
                <span className="profile-editor-choice-index">01</span>
                <span className="profile-editor-choice-icon">
                  <Icon name="camera" className="h-5 w-5" />
                </span>
                <span className="profile-editor-choice-copy">
                  <strong>Avatar</strong>
                  <small>Refresh or remove your profile photo.</small>
                </span>
                <span className="profile-editor-choice-action">
                  Open
                  <Icon name="chevronDown" className="h-4 w-4" />
                </span>
              </button>

              <button
                className="profile-editor-choice is-2"
                onClick={openCoverEditor}
                type="button"
              >
                <span className="profile-editor-choice-index">02</span>
                <span className="profile-editor-choice-icon">
                  <Icon name="camera" className="h-5 w-5" />
                </span>
                <span className="profile-editor-choice-copy">
                  <strong>Cover picture</strong>
                  <small>Set the visual mood of your profile.</small>
                </span>
                <span className="profile-editor-choice-action">
                  Open
                  <Icon name="chevronDown" className="h-4 w-4" />
                </span>
              </button>

              <button
                className="profile-editor-choice is-3"
                onClick={() => openProfileFieldEditor("username")}
                type="button"
              >
                <span className="profile-editor-choice-index">03</span>
                <span className="profile-editor-choice-icon">
                  <Icon name="post" className="h-5 w-5" />
                </span>
                <span className="profile-editor-choice-copy">
                  <strong>Username</strong>
                  <small>Choose the name attached to your voice.</small>
                </span>
                <span className="profile-editor-choice-action">
                  Open
                  <Icon name="chevronDown" className="h-4 w-4" />
                </span>
              </button>

              <button
                className="profile-editor-choice is-4"
                onClick={() => openProfileFieldEditor("bio")}
                type="button"
              >
                <span className="profile-editor-choice-index">04</span>
                <span className="profile-editor-choice-icon">
                  <Icon name="message" className="h-5 w-5" />
                </span>
                <span className="profile-editor-choice-copy">
                  <strong>Bio</strong>
                  <small>Give the community a quick introduction.</small>
                </span>
                <span className="profile-editor-choice-action">
                  Open
                  <Icon name="chevronDown" className="h-4 w-4" />
                </span>
              </button>

              <button
                className="profile-editor-choice is-5"
                onClick={() => navigate("/onboarding?mode=edit")}
                type="button"
              >
                <span className="profile-editor-choice-index">05</span>
                <span className="profile-editor-choice-icon">
                  <Icon name="groups" className="h-5 w-5" />
                </span>
                <span className="profile-editor-choice-copy">
                  <strong>Campus details</strong>
                  <small>Update your year, roles, faculties, and residence.</small>
                </span>
                <span className="profile-editor-choice-action">
                  Open
                  <Icon name="chevronDown" className="h-4 w-4" />
                </span>
              </button>
            </div>

            <footer className="profile-editor-hub-footer">
              <span className="profile-editor-live-mark" aria-hidden="true" />
              Changes appear on your public profile as soon as they are saved.
              <span className="profile-editor-handle">
                @{profileUser.username}
              </span>
            </footer>
          </section>
        </div>
      )}

      {profileFieldEditor && (
        <div className="profile-editor-overlay">
          <section
            aria-labelledby="profile-field-editor-title"
            aria-modal="true"
            className="profile-editor-shell profile-editor-shell--compact"
            role="dialog"
          >
            <div className="profile-editor-ambient" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <header className="profile-editor-header">
              <div>
                <p className="profile-editor-eyebrow">
                  {profileFieldEditor === "username"
                    ? "Your NUSHub identity"
                    : "In your own words"}
                </p>
                <h2
                  className="profile-editor-title"
                  id="profile-field-editor-title"
                >
                  {profileFieldEditor === "username"
                    ? "Make your name memorable."
                    : profileUser.bio
                      ? "Refine your introduction."
                      : "Introduce yourself."}
                </h2>
                <p className="profile-editor-copy">
                  {profileFieldEditor === "username"
                    ? "Use 3–24 letters, numbers, or underscores."
                    : "Share a short introduction in up to 160 characters."}
                </p>
              </div>
              <button
                aria-label={`Close ${profileFieldEditor} editor`}
                className="profile-editor-close"
                disabled={profileFieldSaving}
                onClick={closeProfileFieldEditor}
                type="button"
              >
                  <Icon name="x" className="h-5 w-5" />
              </button>
            </header>

            <div className="profile-editor-field-surface">
              {profileFieldEditor === "username" ? (
                <>
                  <label
                    className="profile-editor-field-label"
                    htmlFor="profile-username-field"
                  >
                    Public username
                    <span>3–24 characters</span>
                  </label>
                  <div className="profile-editor-username-input">
                    <span aria-hidden="true">@</span>
                    <input
                      autoComplete="off"
                      autoFocus
                      id="profile-username-field"
                      maxLength={24}
                      onChange={(event) => {
                        setProfileFieldValue(event.target.value);
                        setProfileFieldError("");
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") handleSaveProfileField();
                      }}
                      placeholder="your_username"
                      value={profileFieldValue}
                    />
                  </div>
                  <p className="profile-editor-field-note">
                    Your profile link and every conversation will carry this
                    name.
                  </p>
                </>
              ) : (
                <>
                  <label
                    className="profile-editor-field-label"
                    htmlFor="profile-bio-field"
                  >
                    Short introduction
                    <span>{profileFieldValue.length}/160</span>
                  </label>
                  <textarea
                    autoFocus
                    id="profile-bio-field"
                    maxLength={160}
                    onChange={(event) => {
                      setProfileFieldValue(event.target.value);
                      setProfileFieldError("");
                    }}
                    placeholder="A little about you..."
                    value={profileFieldValue}
                  />
                  <p className="profile-editor-field-note">
                    A good bio gives people a reason to start a conversation.
                  </p>
                </>
              )}
            </div>

            {profileFieldError && (
              <div className="profile-editor-error" role="alert">
                {profileFieldError}
              </div>
            )}

            <footer className="profile-editor-actions profile-editor-actions--end">
              <button
                className="profile-editor-button profile-editor-button--quiet"
                disabled={profileFieldSaving}
                onClick={closeProfileFieldEditor}
                type="button"
              >
                Cancel
              </button>
              <button
                className="profile-editor-button profile-editor-button--primary"
                disabled={
                  profileFieldSaving ||
                  (profileFieldEditor === "username" &&
                    profileFieldValue.trim() === profileUser.username) ||
                  (profileFieldEditor === "bio" &&
                    profileFieldValue.trim() === (profileUser.bio || ""))
                }
                onClick={handleSaveProfileField}
                type="button"
              >
                {profileFieldSaving ? (
                  <LoadingLabel>Saving changes</LoadingLabel>
                ) : (
                  <>
                    <span>Save changes</span>
                    <Icon name="send" className="h-4 w-4" />
                  </>
                )}
              </button>
            </footer>
          </section>
        </div>
      )}

      {isAvatarModalOpen && (
        <div className="profile-editor-overlay">
          <section
            aria-labelledby="avatar-editor-title"
            aria-modal="true"
            className="profile-editor-shell profile-editor-shell--media"
            role="dialog"
          >
            <div className="profile-editor-ambient" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <header className="profile-editor-header">
              <div>
                <p className="profile-editor-eyebrow">Profile photo</p>
                <h2 className="profile-editor-title" id="avatar-editor-title">
                  Put a face to your voice.
                </h2>
                <p className="profile-editor-copy">
                  JPEG, PNG, or WEBP · up to 5 MB · optimized on upload.
                </p>
              </div>
              <button
                aria-label="Close avatar editor"
                className="profile-editor-close"
                disabled={avatarSaving}
                onClick={resetAvatarModal}
                type="button"
              >
                  <Icon name="x" className="h-5 w-5" />
              </button>
            </header>

            <div className="profile-editor-media-workbench profile-editor-avatar-workbench">
              <div className="profile-editor-avatar-preview">
                {avatarPreviewUrl ? (
                  <img
                    alt="Selected avatar preview"
                    src={avatarPreviewUrl}
                  />
                ) : (
                  <ProfileAvatar
                    className="h-full w-full text-5xl"
                    user={profileUser}
                  />
                )}
              </div>
              <p className="profile-editor-preview-label">
                {avatarPreviewUrl ? "New photo preview" : "Current profile photo"}
              </p>

              <input
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) =>
                  handleAvatarFileChange(event.target.files?.[0] || null)
                }
                ref={avatarInputRef}
                type="file"
              />

              <button
                className="profile-editor-upload-button"
                disabled={avatarSaving}
                onClick={() => avatarInputRef.current?.click()}
                type="button"
              >
                <span className="profile-editor-upload-icon">
                  <Icon name="camera" className="h-5 w-5" />
                </span>
                <span>
                  <strong>
                    {selectedAvatarFile ? "Choose another" : "Choose an image"}
                  </strong>
                  <small>Square images work best</small>
                </span>
              </button>

              {selectedAvatarFile && (
                <div className="profile-editor-file-chip">
                  <Icon name="file" className="h-4 w-4" />
                  <span>{selectedAvatarFile.name}</span>
                  <small>
                    {(selectedAvatarFile.size / 1024 / 1024).toFixed(2)} MB
                  </small>
                </div>
              )}
            </div>

            {avatarError && (
              <div className="profile-editor-error" role="alert">
                {avatarError}
              </div>
            )}

            <footer className="profile-editor-actions">
              <button
                className="profile-editor-button profile-editor-button--danger"
                disabled={avatarSaving || !profileUser.avatar_url}
                onClick={handleRemoveAvatar}
                type="button"
              >
                {avatarAction === "remove" ? (
                  <LoadingLabel>Removing photo</LoadingLabel>
                ) : (
                  <>
                    <Icon name="trash" className="h-4 w-4" />
                    <span>Remove photo</span>
                  </>
                )}
              </button>

              <div className="profile-editor-action-pair">
                <button
                  className="profile-editor-button profile-editor-button--quiet"
                  disabled={avatarSaving}
                  onClick={resetAvatarModal}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="profile-editor-button profile-editor-button--primary"
                  disabled={!selectedAvatarFile || avatarSaving}
                  onClick={handleSaveAvatar}
                  type="button"
                >
                  {avatarAction === "save" ? (
                    <LoadingLabel>Saving photo</LoadingLabel>
                  ) : (
                    <>
                      <span>Save photo</span>
                      <Icon name="send" className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}

      {isCoverModalOpen && (
        <div className="profile-editor-overlay">
          <section
            aria-labelledby="cover-editor-title"
            aria-modal="true"
            className="profile-editor-shell profile-editor-shell--cover"
            role="dialog"
          >
            <div className="profile-editor-ambient" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <header className="profile-editor-header">
              <div>
                <p className="profile-editor-eyebrow">Profile atmosphere</p>
                <h2 className="profile-editor-title" id="cover-editor-title">
                  Set the scene.
                </h2>
                <p className="profile-editor-copy">
                  JPEG, PNG, or WEBP · up to 8 MB · wide images work best.
                </p>
              </div>
              <button
                aria-label="Close cover picture editor"
                className="profile-editor-close"
                disabled={coverSaving}
                onClick={resetCoverModal}
                type="button"
              >
                  <Icon name="x" className="h-5 w-5" />
              </button>
            </header>

            <div className="profile-editor-media-workbench profile-editor-cover-workbench">
              <div className="profile-editor-cover-preview">
                {coverPreviewUrl || profileUser.cover_url ? (
                  <img
                    alt="Cover picture preview"
                    src={coverPreviewUrl || profileUser.cover_url}
                  />
                ) : (
                  <div className="profile-editor-cover-fallback" />
                )}
                <div className="profile-editor-cover-shade" />
                <span className="profile-editor-cover-caption">
                  <strong>@{profileUser.username}</strong>
                  {coverPreviewUrl ? "New cover preview" : "Profile cover"}
                </span>
              </div>

              <input
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) =>
                  handleCoverFileChange(event.target.files?.[0] || null)
                }
                ref={coverInputRef}
                type="file"
              />
              <button
                className="profile-editor-upload-button"
                disabled={coverSaving}
                onClick={() => coverInputRef.current?.click()}
                type="button"
              >
                <span className="profile-editor-upload-icon">
                  <Icon name="camera" className="h-5 w-5" />
                </span>
                <span>
                  <strong>
                    {selectedCoverFile ? "Choose another" : "Choose an image"}
                  </strong>
                  <small>A 3:1 landscape crop is ideal</small>
                </span>
              </button>
              {selectedCoverFile && (
                <div className="profile-editor-file-chip">
                  <Icon name="file" className="h-4 w-4" />
                  <span>{selectedCoverFile.name}</span>
                  <small>
                    {(selectedCoverFile.size / 1024 / 1024).toFixed(2)} MB
                  </small>
                </div>
              )}
            </div>

            {coverError && (
              <div className="profile-editor-error" role="alert">
                {coverError}
              </div>
            )}

            <footer className="profile-editor-actions">
              <button
                className="profile-editor-button profile-editor-button--danger"
                disabled={coverSaving || !profileUser.cover_url}
                onClick={handleRemoveCover}
                type="button"
              >
                {coverAction === "remove" ? (
                  <LoadingLabel>Removing cover</LoadingLabel>
                ) : (
                  <>
                    <Icon name="trash" className="h-4 w-4" />
                    <span>Remove cover</span>
                  </>
                )}
              </button>
              <div className="profile-editor-action-pair">
                <button
                  className="profile-editor-button profile-editor-button--quiet"
                  disabled={coverSaving}
                  onClick={resetCoverModal}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="profile-editor-button profile-editor-button--primary"
                  disabled={!selectedCoverFile || coverSaving}
                  onClick={handleSaveCover}
                  type="button"
                >
                  {coverAction === "save" ? (
                    <LoadingLabel>Saving cover</LoadingLabel>
                  ) : (
                    <>
                      <span>Save cover</span>
                      <Icon name="send" className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </AppShell>
  );
}
