import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import GroupPostCard from "../components/groups/GroupPostCard";
import AppShell from "../components/layout/AppShell";
import Icon from "../components/Icon";
import AiAssistantCard from "../components/ui/AiAssistantCard";
import UserAvatar from "../components/ui/UserAvatar";
import LoadingState, { LoadingLabel } from "../components/ui/LoadingState";
import { apiUrl } from "../utils/api";
import { getAuthToken, getStoredUser } from "../utils/authStorage";
import {
  MAX_POST_ATTACHMENTS,
  uploadGroupPostAttachments,
  validateGroupPostAttachments,
} from "../utils/postApi";

function authHeaders() {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function GroupDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = getStoredUser();
  const highlightedPostId = searchParams.get("post");

  const [groupData, setGroupData] = useState(null);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [postsLoading, setPostsLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [roleUpdating, setRoleUpdating] = useState(null);
  const [memberRemoving, setMemberRemoving] = useState(null);
  const [openMemberMenu, setOpenMemberMenu] = useState(null);
  const [showComposer, setShowComposer] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState({
    title: "",
    content: "",
    privacy: "private",
  });

  const fetchGroup = async () => {
    const response = await fetch(apiUrl(`/api/groups/${id}`), {
      headers: authHeaders(),
    });
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Group not found");
    }

    setGroupData(data);
    return data;
  };

  const fetchPosts = async () => {
    setPostsLoading(true);

    try {
      const response = await fetch(apiUrl(`/api/groups/${id}/posts`), {
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not load posts");
      setPosts(data);
    } finally {
      setPostsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;

    Promise.all([fetchGroup(), fetchPosts()])
      .catch((err) => {
        if (active) setPageError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!postsLoading && highlightedPostId) {
      document
        .getElementById(`group-post-${highlightedPostId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlightedPostId, postsLoading]);

  useEffect(() => {
    if (!openMemberMenu) return;

    const closeOnOutsideClick = (event) => {
      if (
        event.target instanceof Element &&
        event.target.closest(".group-member-menu-wrap")
      ) {
        return;
      }

      setOpenMemberMenu(null);
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpenMemberMenu(null);
    };

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMemberMenu]);

  const admins = useMemo(
    () =>
      groupData?.members.filter(
        (member) => member.role === "admin" || member.is_creator,
      ) || [],
    [groupData],
  );
  const creator = useMemo(
    () =>
      groupData?.members.find(
        (member) =>
          member.is_creator ||
          String(member.id) === String(groupData.group.creator_id),
      ) || null,
    [groupData],
  );

  const handleJoinLeave = async () => {
    if (!user) {
      navigate("/login");
      return;
    }

    setJoining(true);
    setPageError("");

    try {
      const response = await fetch(apiUrl(`/api/groups/${id}/join`), {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update membership");
      await Promise.all([fetchGroup(), fetchPosts()]);
    } catch (err) {
      setPageError(err.message);
    } finally {
      setJoining(false);
    }
  };

  const setAdminBadge = async (member, isAdmin) => {
    setRoleUpdating(member.id);
    setOpenMemberMenu(null);
    setPageError("");

    try {
      const response = await fetch(
        apiUrl(`/api/groups/${id}/members/${member.id}/admin`),
        {
          method: "PATCH",
          headers: {
            ...authHeaders(),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ is_admin: isAdmin }),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update role");
      await fetchGroup();
    } catch (err) {
      setPageError(err.message);
    } finally {
      setRoleUpdating(null);
    }
  };

  const removeMember = async (member) => {
    const confirmed = window.confirm(
      `Remove ${member.username} from ${groupData.group.name}?`,
    );

    if (!confirmed) return;

    setMemberRemoving(member.id);
    setOpenMemberMenu(null);
    setPageError("");

    try {
      const response = await fetch(
        apiUrl(`/api/groups/${id}/members/${member.id}`),
        {
          method: "DELETE",
          headers: authHeaders(),
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not remove member");

      await Promise.all([fetchGroup(), fetchPosts()]);
    } catch (err) {
      setPageError(err.message);
    } finally {
      setMemberRemoving(null);
    }
  };

  const publishPost = async (event) => {
    event.preventDefault();
    if (!draft.title.trim()) return;

    setPublishing(true);
    setPageError("");

    try {
      const uploadedAttachments = await uploadGroupPostAttachments(
        id,
        selectedFiles,
      );
      const response = await fetch(apiUrl(`/api/groups/${id}/posts`), {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...draft,
          attachments: uploadedAttachments,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not publish post");

      setDraft({ title: "", content: "", privacy: "private" });
      setSelectedFiles([]);
      setShowComposer(false);
      await fetchPosts();
    } catch (err) {
      setPageError(err.message);
    } finally {
      setPublishing(false);
    }
  };

  const selectFiles = (files: FileList | null) => {
    if (!files) return;

    const nextFiles = [...selectedFiles, ...Array.from(files)];

    try {
      validateGroupPostAttachments(nextFiles);
      setSelectedFiles(nextFiles);
      setPageError("");
    } catch (err) {
      setPageError(err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <AppShell contextualPlaceholder="Search groups..." user={user}>
        <LoadingState
          detail="Preparing the group feed and member permissions."
          label="Loading study group"
        />
      </AppShell>
    );
  }

  if (!groupData) {
    return (
      <AppShell contextualPlaceholder="Search groups..." user={user}>
        <section className="app-empty-state">
          <h1 className="text-xl font-bold text-app-text">
            This group is unavailable
          </h1>
          <p className="mt-2 text-sm text-app-muted">{pageError}</p>
          <Link className="app-button-primary mt-5" to="/groups">
            Back to groups
          </Link>
        </section>
      </AppShell>
    );
  }

  const { group, members, viewer } = groupData;
  const isCreator = String(group.creator_id) === String(user?.id);

  const snapshot = (
    <div className="forum-sidebar-stack group-detail-sidebar space-y-4">
      <AiAssistantCard
        description="Ask for a study plan, summarize shared goals, or draft questions for your next session."
        title="Group Study Assistant"
      />

      <section className="app-section-card group-detail-snapshot">
        <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-app-muted">
          Group Snapshot
        </h2>
        <div className="space-y-3">
          <div className="group-detail-snapshot-row">
            <span className="group-detail-snapshot-icon">
              <Icon name="post" className="h-4 w-4" />
            </span>
            <div>
              <strong>{group.module_code || "General"}</strong>
              <span>Module</span>
            </div>
          </div>
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
            <span className="group-snapshot-creator-avatar">
              <UserAvatar
                avatarUrl={creator?.avatar_url}
                className="h-9 w-9 text-xs"
                name={creator?.username || group.creator_name}
                rounded="lg"
                userId={creator?.id}
              />
            </span>
            <div>
              <strong>{group.creator_name || "[Deleted user]"}</strong>
              <span>Group creator</span>
            </div>
          </div>
          <div className="group-detail-snapshot-row">
            <span className="group-detail-snapshot-icon">
              <span aria-hidden="true">◆</span>
            </span>
            <div>
              <strong>{admins.map((admin) => admin.username).join(", ")}</strong>
              <span>{admins.length} admin{admins.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        </div>
      </section>

      <section className="app-section-card group-snapshot-members">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-app-muted">
            Members
          </h2>
          <span className="group-snapshot-member-count">{members.length}</span>
        </div>
        <div className="mt-3 space-y-2">
          {members.map((member) => (
            <div className="group-snapshot-member" key={member.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Link
                    aria-label={`View ${member.username}'s profile`}
                    to={
                      String(member.id) === String(user?.id)
                        ? "/profile"
                        : `/users/${member.id}`
                    }
                  >
                    <UserAvatar
                      avatarUrl={member.avatar_url}
                      className="h-9 w-9 text-xs"
                      name={member.username}
                      rounded="lg"
                      userId={member.id}
                    />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-app-text">
                      {member.username}
                      {String(member.id) === String(user?.id) && (
                        <span className="ml-1 text-xs text-app-muted">(you)</span>
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {member.badges.map((badge) => (
                        <span
                          className={`group-detail-role-badge is-${badge
                            .toLowerCase()
                            .replace("group ", "")
                            .replace(" ", "-")}`}
                          key={badge}
                        >
                          {badge}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {viewer.is_admin && !member.is_creator && (
                  <div className="group-member-menu-wrap">
                    <button
                      aria-expanded={openMemberMenu === member.id}
                      aria-haspopup="menu"
                      aria-label={`Manage ${member.username}`}
                      className="group-member-menu-trigger"
                      disabled={
                        roleUpdating === member.id ||
                        memberRemoving === member.id
                      }
                      onClick={() =>
                        setOpenMemberMenu((current) =>
                          current === member.id ? null : member.id,
                        )
                      }
                      type="button"
                    >
                      <span aria-hidden="true">⋮</span>
                    </button>

                    {openMemberMenu === member.id && (
                      <div
                        aria-label={`Actions for ${member.username}`}
                        className="group-member-menu"
                        role="menu"
                      >
                        <button
                          onClick={() =>
                            setAdminBadge(member, member.role !== "admin")
                          }
                          role="menuitem"
                          type="button"
                        >
                          {member.role === "admin"
                            ? "Remove admin"
                            : "Make admin"}
                        </button>
                        <button
                          className="is-danger"
                          onClick={() => removeMember(member)}
                          role="menuitem"
                          type="button"
                        >
                          Delete member
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  return (
    <AppShell
      contextualPlaceholder="Search groups..."
      sidebar={snapshot}
      sidebarSize="compact"
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

        <section className="app-hero group-detail-hero">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-primary-fixed-dim">
                Study group
              </p>
              <h1 className="group-detail-title mt-2 text-3xl font-bold tracking-tight md:text-4xl">
                {group.name}
              </h1>
              {group.description && (
                <p className="group-detail-description mt-3 max-w-3xl text-sm leading-6 text-white/80">
                  {group.description}
                </p>
              )}
            </div>

            {isCreator ? (
              <span className="group-detail-creator-label">Group creator</span>
            ) : (
              <button
                className={`group-detail-membership-button inline-flex shrink-0 items-center justify-center gap-2 px-4 py-2 text-sm font-bold ${
                  viewer.is_member ? "is-member" : ""
                }`}
                disabled={joining}
                onClick={handleJoinLeave}
                type="button"
              >
                <Icon name="groups" className="h-4 w-4" />
                {joining ? (
                  <LoadingLabel>
                    {viewer.is_member ? "Leaving" : "Joining"}
                  </LoadingLabel>
                ) : viewer.is_member ? (
                  "Leave group"
                ) : (
                  "Join group"
                )}
              </button>
            )}
          </div>
        </section>

        {pageError && (
          <div className="group-post-page-error" role="alert">
            {pageError}
          </div>
        )}

        <section className="group-feed-heading">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">
              Group discussion
            </p>
            <h2 className="mt-1 text-2xl font-bold text-app-text">Posts</h2>
            <p className="mt-1 text-sm text-app-muted">
              Public posts are visible to everyone. Group-only posts stay with members.
            </p>
          </div>
          {viewer.can_post && (
            <button
              className="groups-primary-button"
              onClick={() => setShowComposer((value) => !value)}
              type="button"
            >
              <Icon name={showComposer ? "x" : "plus"} className="h-4 w-4" />
              {showComposer ? "Close" : "New post"}
            </button>
          )}
        </section>

        {viewer.can_post ? (
          showComposer && (
            <form className="group-post-composer" onSubmit={publishPost}>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  Posting as {user?.username}
                </p>
                <h2 className="mt-1 text-lg font-bold text-app-text">
                  Share with the group
                </h2>
                <p className="mt-1 text-xs text-app-muted">
                  Group posts always show your account and cannot be anonymous.
                </p>
              </div>
              <input
                className="app-input mt-4 w-full"
                maxLength={300}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
                placeholder="Post title"
                value={draft.title}
              />
              <textarea
                className="app-input mt-3 min-h-32 w-full resize-y"
                onChange={(event) =>
                  setDraft({ ...draft, content: event.target.value })
                }
                placeholder="Write an update, resource, or discussion prompt…"
                value={draft.content}
              />
              <section className="group-post-attachments mt-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-app-text">
                      Attach study files
                    </h3>
                    <p className="mt-1 text-xs text-app-muted">
                      Up to {MAX_POST_ATTACHMENTS} files, 15 MB each.
                    </p>
                  </div>
                  <input
                    className="hidden"
                    multiple
                    onChange={(event) => selectFiles(event.target.files)}
                    ref={fileInputRef}
                    type="file"
                  />
                  <button
                    className="group-post-file-button"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    <Icon name="paperclip" className="h-4 w-4" />
                    Choose files
                  </button>
                </div>

                {selectedFiles.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {selectedFiles.map((file, index) => (
                      <div
                        className="group-post-selected-file"
                        key={`${file.name}-${file.lastModified}-${index}`}
                      >
                        <span className="group-post-selected-file-icon">
                          <Icon name="file" className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <strong>{file.name}</strong>
                          <small>
                            {(file.size / (1024 * 1024)).toFixed(1)} MB
                          </small>
                        </span>
                        <button
                          aria-label={`Remove ${file.name}`}
                          onClick={() =>
                            setSelectedFiles((current) =>
                              current.filter(
                                (_selectedFile, selectedIndex) =>
                                  selectedIndex !== index,
                              ),
                            )
                          }
                          type="button"
                        >
                          <Icon name="x" className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div
                  aria-label="Post privacy"
                  className="group-post-privacy-control"
                  role="group"
                >
                  {[
                    ["private", "Group only"],
                    ["public", "Public"],
                  ].map(([value, label]) => (
                    <button
                      aria-pressed={draft.privacy === value}
                      className={draft.privacy === value ? "is-active" : ""}
                      key={value}
                      onClick={() => setDraft({ ...draft, privacy: value })}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  className="groups-primary-button"
                  disabled={publishing || !draft.title.trim()}
                  type="submit"
                >
                  {publishing ? <LoadingLabel>Publishing</LoadingLabel> : "Publish post"}
                </button>
              </div>
            </form>
          )
        ) : (
          <div className="group-post-permission-note">
            <Icon name="post" className="h-5 w-5" />
            <div>
              <strong>Admins publish group posts</strong>
              <span>
                {viewer.is_member
                  ? "You can comment, reply, and upvote every post."
                  : "Join to comment and reply. Public posts can still be viewed and upvoted."}
              </span>
            </div>
          </div>
        )}

        {postsLoading ? (
          <LoadingState
            detail="Loading this group’s latest posts."
            label="Loading group posts"
            rows={2}
            variant="feed"
          />
        ) : posts.length ? (
          <div className="space-y-4">
            {posts.map((post) => (
              <GroupPostCard
                initialOpen={post.id === highlightedPostId}
                key={post.id}
                onPostChanged={(nextPost) =>
                  setPosts((current) =>
                    current.map((item) =>
                      item.id === nextPost.id ? nextPost : item,
                    ),
                  )
                }
                onPostDeleted={(postId) =>
                  setPosts((current) =>
                    current.filter((item) => item.id !== postId),
                  )
                }
                post={post}
                user={user}
              />
            ))}
          </div>
        ) : (
          <section className="app-empty-state">
            <h2 className="text-xl font-bold text-app-text">
              {viewer.is_member
                ? "No group posts yet"
                : "No public posts yet"}
            </h2>
            <p className="mt-2 text-sm text-app-muted">
              {viewer.can_post
                ? "Start the group discussion with the first post."
                : viewer.is_member
                  ? "An admin can start the first discussion."
                  : "Join the group to see group-only discussions."}
            </p>
          </section>
        )}
      </div>
    </AppShell>
  );
}
