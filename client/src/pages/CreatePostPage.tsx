import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import AppShell from "../components/layout/AppShell";
import UserAvatar from "../components/ui/UserAvatar";
import { LoadingLabel } from "../components/ui/LoadingState";
import { apiUrl } from "../utils/api";
import { getAuthToken, getStoredUser } from "../utils/authStorage";
import {
  MAX_POST_ATTACHMENTS,
  uploadPostAttachments,
  validatePostAttachments,
} from "../utils/postApi";

const TOPICS = [
  {
    name: "Modules",
    description: "Classes, workload, bidding, and exam advice",
    accent: "bg-primary-fixed text-primary",
    badgeStyle: { backgroundColor: "#d6e3ff", color: "#002754" },
  },
  {
    name: "Housing",
    description: "Halls, RCs, rentals, rooms, and campus living",
    accent: "bg-slate-200 text-slate-800",
    badgeStyle: { backgroundColor: "#e2e8f0", color: "#1e293b" },
  },
  {
    name: "Food",
    description: "Canteens, menus, prices, and meal finds",
    accent: "bg-emerald-100 text-emerald-800",
    badgeStyle: { backgroundColor: "#d1fae5", color: "#065f46" },
  },
  {
    name: "Buses",
    description: "Routes, timings, queues, and transport updates",
    accent: "bg-amber-100 text-amber-800",
    badgeStyle: { backgroundColor: "#fef3c7", color: "#92400e" },
  },
  {
    name: "Facilities",
    description: "Libraries, study rooms, labs, and sports spaces",
    accent: "bg-sky-100 text-sky-800",
    badgeStyle: { backgroundColor: "#e0f2fe", color: "#075985" },
  },
  {
    name: "General",
    description: "Campus life, questions, stories, and everything else",
    accent: "bg-secondary-fixed text-secondary",
    badgeStyle: { backgroundColor: "#ffdcc5", color: "#944a00" },
  },
];

const MAX_TITLE_LENGTH = 120;
const MAX_CONTENT_LENGTH = 2200;

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.max(1, Math.round(size / 1024))} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CreatePostPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [topic, setTopic] = useState("General");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const navigate = useNavigate();
  const user = getStoredUser();

  const selectedTopic = useMemo(
    () => TOPICS.find((item) => item.name === topic) ?? TOPICS[TOPICS.length - 1],
    [topic]
  );

  const isReadyToPost = title.trim().length > 0 && !loading;

  const handleFileSelect = (files: FileList | null) => {
    if (!files) {
      return;
    }

    // combines newly selected files with previously selected files
    const nextFiles = [...selectedFiles, ...Array.from(files)];

    try {
      validatePostAttachments(nextFiles);
      setSelectedFiles(nextFiles); // if valid, select these files
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid file selection");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ""; // allows user to select the same file again later
      }
    }
  };

  const removeSelectedFile = (indexToRemove: number) => {
    setSelectedFiles((currentFiles) =>
      currentFiles.filter((_file, index) => index !== indexToRemove),
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = getAuthToken();
      const uploadedAttachments = await uploadPostAttachments(selectedFiles);

      const res = await fetch(apiUrl("/api/posts"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`, // send token to prove who we are
        },
        body: JSON.stringify({
          title: title.trim(),
          content: content.trim(),
          topic,
          is_anonymous: isAnonymous,
          attachments: uploadedAttachments,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Could not create this post");
        return;
      }

      navigate(data.id ? `/posts/${data.id}` : "/"); // open the new post when the API returns its id
    } catch (err) {
      setError("Something went wrong. Is your server running?");
    } finally {
      setLoading(false);
    }
  };

  const sidebar = (
    <div className="create-post-sidebar space-y-4">
      <section className="app-section-card create-post-checklist">
        <div className="flex items-start gap-3">
          <div className="create-post-sidebar-icon flex h-10 w-10 shrink-0 items-center justify-center">
            <Icon name="post" className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-primary">Post checklist</h2>
            <p className="mt-1 text-sm text-app-muted">
              A clear title gets better replies faster.
            </p>
          </div>
        </div>

        <div className="create-post-checklist-list mt-5 space-y-3 text-sm text-app-muted">
          <div className="create-post-checklist-item flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-xs font-bold">
              1
            </span>
            <p>Pick the closest topic so people can scan the forum quickly.</p>
          </div>
          <div className="create-post-checklist-item flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-xs font-bold">
              2
            </span>
            <p>Add context, module codes, bus stop names, or dates when useful.</p>
          </div>
          <div className="create-post-checklist-item flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-xs font-bold">
              3
            </span>
            <p>Use anonymous mode only when identity might distract from the question.</p>
          </div>
        </div>
      </section>

      <section className="app-card create-post-preview overflow-hidden">
        <div className="create-post-preview-head px-5 py-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em]">
            Current topic
          </p>
          <h2 className="mt-1 text-xl font-bold">{selectedTopic.name}</h2>
        </div>
        <div className="p-5">
          <p className="text-sm text-app-muted">{selectedTopic.description}</p>
          <div className="create-post-identity-preview mt-4 border border-dashed border-outline-variant p-4">
            <p className="text-sm font-semibold text-primary">Preview identity</p>
            <div className="mt-3 flex items-center gap-3">
              <UserAvatar
                avatarUrl={isAnonymous ? null : user?.avatar_url}
                className="h-11 w-11 text-lg"
                name={isAnonymous ? "?" : user?.username || "NUSHub user"}
                rounded="lg"
                userId={isAnonymous ? null : user?.id}
              />
              <div>
                <p className="font-bold text-app-text">
                  {isAnonymous ? "Anonymous" : user?.username || "NUSHub user"}
                </p>
                <p className="text-sm text-app-muted">
                  {isAnonymous ? "Your name will be hidden on the post" : "Your profile will be linked"}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  return (
    <AppShell user={user} sidebar={sidebar} sidebarSize="compact">
      <div className="create-post-refresh space-y-6">
        <section className="create-post-workspace overflow-hidden">
          <div className="create-post-header px-5 py-5 sm:px-7">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary-container">
                  New discussion
                </p>
                <h1 className="mt-1 text-3xl font-bold text-primary">
                  Create a post
                </h1>
              </div>
              <span
                className={`create-post-status ${isReadyToPost ? "is-ready" : ""}`}
              >
                <i />
                {isReadyToPost ? "Ready to publish" : "Draft in progress"}
              </span>
            </div>
          </div>

          <div className="create-post-body space-y-8 p-5 sm:p-7">
            {error && (
              <div className="create-post-error border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-app-danger">
                {error}
              </div>
            )}

            <section className="create-post-topic-section">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-app-text">Choose a topic</h2>
                  <p className="text-sm text-app-muted">Help the right people find your discussion.</p>
                </div>
                <span
                  className="create-post-selected-topic inline-flex items-center px-4 py-1.5 text-sm font-bold"
                  style={selectedTopic.badgeStyle}
                >
                  {selectedTopic.name}
                </span>
              </div>

              <div className="create-post-topic-grid mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {TOPICS.map((item) => {
                  const selected = topic === item.name;

                  return (
                    <button
                      aria-pressed={selected}
                      className={`create-post-topic-card border p-4 text-left ${
                        selected ? "is-selected" : ""
                      }`}
                      key={item.name}
                      onClick={() => setTopic(item.name)}
                      type="button"
                    >
                      <span
                        className="create-post-topic-name inline-flex px-3 py-1 text-sm font-bold"
                        style={
                          selected
                            ? { backgroundColor: "rgba(255, 255, 255, 0.16)", color: "#ffffff" }
                            : item.badgeStyle
                        }
                      >
                        {item.name}
                      </span>
                      <p className={`mt-3 text-sm ${selected ? "text-white/80" : "text-app-muted"}`}>
                        {item.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="create-post-editor space-y-10">
              <div className="create-post-field space-y-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-bold text-app-text" htmlFor="post-title">
                    Title
                  </label>
                  <span className="text-xs font-semibold text-app-muted">
                    {title.length}/{MAX_TITLE_LENGTH}
                  </span>
                </div>
                <input
                  className="app-input create-post-title-input h-14 text-base font-semibold"
                  id="post-title"
                  maxLength={MAX_TITLE_LENGTH}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What's your question or topic?"
                  value={title}
                />
              </div>

              <div className="create-post-field mt-8 space-y-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-bold text-app-text" htmlFor="post-content">
                    Details <span className="font-medium text-app-muted">(optional)</span>
                  </label>
                  <span className="text-xs font-semibold text-app-muted">
                    {content.length}/{MAX_CONTENT_LENGTH}
                  </span>
                </div>
                <div className="create-post-content-editor overflow-hidden border border-slate-300 bg-white">
                  <textarea
                    className="min-h-64 w-full resize-y border-0 bg-transparent px-4 py-4 text-base text-app-text outline-none placeholder:text-outline"
                    id="post-content"
                    maxLength={MAX_CONTENT_LENGTH}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Add useful details: what you tried, where it happened, module code, timing, or what kind of answer you need..."
                    value={content}
                  />
                </div>
              </div>
            </section>

            <section className="create-post-attachments border border-dashed border-slate-300 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-app-text">Attach files</h2>
                  <p className="mt-1 text-sm text-app-muted">
                    Add up to {MAX_POST_ATTACHMENTS} files, 10 MB each.
                  </p>
                </div>
                <input
                  className="hidden"
                  multiple
                  onChange={(event) => handleFileSelect(event.target.files)}
                  ref={fileInputRef}
                  type="file"
                />
                <button
                  className="create-post-file-button w-fit"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Icon name="paperclip" className="h-4 w-4" />
                  Choose files
                </button>
              </div>

              {selectedFiles.length > 0 && (
                <div className="mt-4 grid gap-2">
                  {selectedFiles.map((file, index) => (
                    <div
                      className="create-post-file-row flex items-center gap-3 border border-slate-200 bg-white px-3 py-2"
                      key={`${file.name}-${file.lastModified}-${index}`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-fixed text-primary">
                        <Icon name="file" className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-app-text">{file.name}</p>
                        <p className="text-xs font-semibold text-app-muted">
                          {formatFileSize(file.size)}
                        </p>
                      </div>
                      <button
                        aria-label={`Remove ${file.name}`}
                        className="create-post-file-remove flex h-8 w-8 shrink-0 items-center justify-center text-app-muted"
                        onClick={() => removeSelectedFile(index)}
                        type="button"
                      >
                        <Icon name="x" className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <label className="create-post-anonymous flex cursor-pointer select-none items-center gap-3">
              <button
                aria-label="Toggle anonymous posting"
                aria-pressed={isAnonymous}
                className={`create-post-toggle relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  isAnonymous ? "bg-primary" : "bg-surface-highest"
                }`}
                onClick={() => setIsAnonymous(!isAnonymous)}
                type="button"
              >
                <span
                  className={`absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    isAnonymous ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
              <span>
                <strong className="block text-sm font-semibold text-app-text">
                  Post anonymously
                </strong>
                <small className="mt-0.5 block text-xs text-app-muted">
                  Your profile will not be linked to this discussion.
                </small>
              </span>
            </label>

            <div className="create-post-actions flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                className="create-post-cancel sm:min-w-32"
                onClick={() => navigate("/")}
                type="button"
              >
                Cancel
              </button>
              <button
                className="create-post-publish sm:min-w-44"
                disabled={!isReadyToPost}
                onClick={handleSubmit}
                type="button"
              >
                <Icon name="plus" className="h-5 w-5" />
                {loading ? (
                  <LoadingLabel>Publishing</LoadingLabel>
                ) : (
                  "Publish post"
                )}
              </button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
