import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "../components/Icon";
import AppShell from "../components/layout/AppShell";

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

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user"));
  } catch {
    return null;
  }
}

export default function CreatePostPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [topic, setTopic] = useState("General");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const user = getStoredUser();

  const selectedTopic = useMemo(
    () => TOPICS.find((item) => item.name === topic) ?? TOPICS[TOPICS.length - 1],
    [topic]
  );

  const isReadyToPost = title.trim().length > 0 && !loading;

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Please enter a title");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");

      const res = await fetch("http://localhost:5000/api/posts", {
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
    <div className="space-y-5">
      <section className="app-card p-5 shadow-soft">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary-fixed text-secondary">
            <Icon name="post" className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-primary">Post checklist</h2>
            <p className="mt-1 text-sm text-app-muted">
              A clear title gets better replies faster.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3 text-sm text-app-muted">
          <div className="flex gap-3 rounded-lg bg-surface-low p-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              1
            </span>
            <p>Pick the closest topic so people can scan the forum quickly.</p>
          </div>
          <div className="flex gap-3 rounded-lg bg-surface-low p-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              2
            </span>
            <p>Add context, module codes, bus stop names, or dates when useful.</p>
          </div>
          <div className="flex gap-3 rounded-lg bg-surface-low p-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">
              3
            </span>
            <p>Use anonymous mode only when identity might distract from the question.</p>
          </div>
        </div>
      </section>

      <section className="app-card overflow-hidden shadow-soft">
        <div className="border-b border-surface-variant bg-primary px-5 py-4 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-fixed">
            Current topic
          </p>
          <h2 className="mt-1 text-xl font-black">{selectedTopic.name}</h2>
        </div>
        <div className="p-5">
          <p className="text-sm text-app-muted">{selectedTopic.description}</p>
          <div className="mt-4 rounded-lg border border-dashed border-outline-variant bg-surface-low p-4">
            <p className="text-sm font-semibold text-primary">Preview identity</p>
            <div className="mt-3 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-lg font-black text-white">
                {isAnonymous ? "?" : user?.username?.charAt(0)?.toUpperCase() || "N"}
              </div>
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
    <AppShell user={user} sidebar={sidebar}>
      <div className="space-y-6">
        <section className="app-card overflow-hidden shadow-soft">
          <div className="border-b border-surface-variant bg-white px-5 py-4 sm:px-7">
            <div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-secondary-container">
                  New discussion
                </p>
                <h1 className="mt-1 text-3xl font-black text-primary">
                  Create a post
                </h1>
              </div>
            </div>
          </div>

          <div className="space-y-8 p-5 sm:p-7">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-app-danger">
                {error}
              </div>
            )}

            <section>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-app-text">Choose a topic</h2>
                  <p className="text-sm text-app-muted">This works like the category selector in polished forum composers.</p>
                </div>
                <span
                  className="inline-flex items-center rounded-full px-4 py-1.5 text-sm font-bold"
                  style={selectedTopic.badgeStyle}
                >
                  {selectedTopic.name}
                </span>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {TOPICS.map((item) => {
                  const selected = topic === item.name;

                  return (
                    <button
                      className={`rounded-lg border p-4 text-left transition-all ${
                        selected
                          ? "border-primary bg-primary text-white shadow-soft"
                          : "border-outline-variant bg-white hover:-translate-y-0.5 hover:border-primary hover:shadow-soft"
                      }`}
                      key={item.name}
                      onClick={() => setTopic(item.name)}
                      type="button"
                    >
                      <span
                        className="inline-flex rounded-full px-4 py-1.5 text-sm font-bold"
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

            <section className="space-y-10">
              <div className="space-y-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-bold text-app-text" htmlFor="post-title">
                    Title
                  </label>
                  <span className="text-xs font-semibold text-app-muted">
                    {title.length}/{MAX_TITLE_LENGTH}
                  </span>
                </div>
                <input
                  className="app-input h-14 text-base font-semibold"
                  id="post-title"
                  maxLength={MAX_TITLE_LENGTH}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="What's your question or topic?"
                  value={title}
                />
              </div>

              <div className="mt-8 space-y-2">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="text-sm font-bold text-app-text" htmlFor="post-content">
                    Details <span className="font-medium text-app-muted">(optional)</span>
                  </label>
                  <span className="text-xs font-semibold text-app-muted">
                    {content.length}/{MAX_CONTENT_LENGTH}
                  </span>
                </div>
                <div className="overflow-hidden rounded-lg border border-outline-variant bg-white focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                  <div className="flex items-center gap-2 border-b border-surface-variant bg-surface-low px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-app-muted">
                    <span className="h-2 w-2 rounded-full bg-secondary-container" />
                    Compose
                  </div>
                  <textarea
                    className="min-h-64 w-full resize-y border-0 bg-white px-4 py-4 text-base text-app-text outline-none placeholder:text-outline"
                    id="post-content"
                    maxLength={MAX_CONTENT_LENGTH}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Add useful details: what you tried, where it happened, module code, timing, or what kind of answer you need..."
                    value={content}
                  />
                </div>
              </div>
            </section>

            <label className="flex w-fit cursor-pointer select-none items-center gap-3">
              <button
                aria-label="Toggle anonymous posting"
                aria-pressed={isAnonymous}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
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
              <span className="text-sm font-semibold text-app-text">Post anonymously</span>
            </label>

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
              <button
                className="app-button-ghost sm:min-w-32"
                onClick={() => navigate("/")}
                type="button"
              >
                Cancel
              </button>
              <button
                className="app-button-secondary sm:min-w-44"
                disabled={!isReadyToPost}
                onClick={handleSubmit}
                type="button"
              >
                <Icon name="plus" className="h-5 w-5" />
                {loading ? "Posting..." : "Publish post"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
