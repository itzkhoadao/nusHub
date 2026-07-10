// useState stores what the user types.
// fetch() sends data requests to your Express backend.
// localStorage remembers the logged-in user after refresh.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import AiAssistantCard from "../components/ui/AiAssistantCard";
import DiscussionCard from "../components/ui/DiscussionCard";
import { apiUrl } from "../utils/api";
import { getAuthToken, getStoredUser } from "../utils/authStorage";
import { getRecentActivity } from "../utils/recentActivity";

const TOPICS = [
  "All",
  "Modules",
  "Housing",
  "Food",
  "Buses",
  "Facilities",
  "General",
];

export default function HomePage() {
  const [posts, setPosts] = useState([]);
  const [topic, setTopic] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [loading, setLoading] = useState(true);
  const [recentItems, setRecentItems] = useState([]);
  const navigate = useNavigate();

  const user = getStoredUser();

  // asks the backend for posts
  // URLSearchParams safely builds query strings
  const fetchPosts = async (searchText = search) => {
    setLoading(true);

    try {
      const params = new URLSearchParams({ sort });

      if (topic !== "All") {
        params.set("topic", topic);
      }

      if (searchText.trim()) {
        params.set("search", searchText.trim());
      }

      const token = getAuthToken();
      const res = await fetch(apiUrl(`/api/posts?${params}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }); // send a request to backend URL
      const data = await res.json(); // take the response
      setPosts(data); // the page updates
    } catch (err) {
      console.error("Failed to fetch posts:", err);
    } finally {
      setLoading(false);
    }
  };

  // Redirect to login if not logged in
  // If logged in, fetch posts whenever topic or sort changes
  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    fetchPosts();
  }, [topic, sort]);

  // reads user's 3 most recently opened posts/groups from the database
  useEffect(() => {
    const fetchRecentItems = async () => {
      setRecentItems(await getRecentActivity());
    };

    fetchRecentItems();

    const handleFocus = () => {
      fetchRecentItems();
    };

    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [user?.id]);

  // handleSearch runs whenenever user searches
  const handleSearch = (searchText = search) => {
    fetchPosts(searchText);
  };

  // clearSearch removes the search text and fetches the full feed again
  const clearSearch = () => {
    setSearch("");
    fetchPosts("");
  };

  // toggle an upvote for the current user
  // refreshes posts so upvote count is shown
  const handleUpvote = async (postId) => {
    const token = getAuthToken();
    const res = await fetch(apiUrl(`/api/posts/${postId}/upvote`), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();

    setPosts((currentPosts) =>
      currentPosts.map((post) =>
        post.id === postId
          ? {
              ...post,
              upvoted: data.upvoted,
              upvotes: Number(post.upvotes) + (data.upvoted ? 1 : -1),
            }
          : post,
      ),
    );
  };

  return (
    <AppShell
      contextualPlaceholder="Search forum..."
      onSearchChange={setSearch}
      onSearchClear={clearSearch}
      onSearchSubmit={handleSearch}
      searchValue={search}
      sidebar={
        <div className="space-y-4">
          <AiAssistantCard />

          {/* Right sidebar remembers posts/groups the user opened recently */}
          <section className="app-section-card">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-app-muted">
              Recent
            </h2>
            {recentItems.length > 0 ? (
              <div className="space-y-3 text-sm font-semibold text-app-text">
                {recentItems.map((item) => (
                  <Link
                    className="group block rounded-lg border border-slate-200 bg-white p-3 shadow-sm ring-1 ring-slate-900/5 transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:bg-primary-fixed/30 hover:text-primary"
                    key={`${item.type}-${item.id}`}
                    to={item.path}
                  >
                    <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-app-muted">
                      {item.type === "group" ? "Group" : "Post"}
                    </span>
                    {item.title}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-app-muted">
                Open a post or study group to see it here.
              </p>
            )}
          </section>
        </div>
      }
      user={user}
    >
      <div className="space-y-6">
        {/* Hero summary: tells the user what this feed is for */}
        <section className="app-hero">
          <p className="text-sm font-semibold uppercase tracking-wide text-primary-fixed-dim">
            NUSHub Community
          </p>
          <div className="mt-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
                Campus conversations, organized.
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/80">
                Browse module advice, housing questions, food tips, transport
                updates, and student discussions in one structured feed.
              </p>
            </div>
            <Link className="app-button-secondary shrink-0" to="/create-post">
              Create Post
            </Link>
          </div>
        </section>

        {/* Sort and topic filters. Search lives in the topbar now. */}
        <section className="app-section-card">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-app-muted">
                Browse Feed
              </h2>
              <p className="mt-1 text-sm text-app-muted">
                Use the top search bar, then refine by sort or topic.
              </p>
            </div>

            <div className="flex w-fit rounded-lg border border-slate-200 bg-surface-low p-1 shadow-inner">
              {["recent", "popular"].map((option) => (
                <button
                  className={`rounded-md px-4 py-2 text-sm font-bold capitalize transition-colors ${
                    sort === option
                    ? "bg-primary text-white shadow-sm"
                    : "text-app-muted hover:bg-white hover:text-primary"
                  }`}
                  key={option}
                  onClick={() => setSort(option)}
                  type="button"
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {TOPICS.map((item) => (
              <button
                className={`rounded-full border px-4 py-1.5 text-sm font-bold transition-colors ${
                  topic === item
                    ? "border-primary bg-primary text-white shadow-sm"
                    : "border-slate-200 bg-white text-app-muted shadow-sm hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary-fixed/30 hover:text-primary"
                }`}
                key={item}
                onClick={() => setTopic(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </section>

        {/* Posts */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((item) => (
              <div className="app-card animate-pulse p-5" key={item}>
                <div className="mb-4 h-4 w-24 rounded bg-surface-high" />
                <div className="mb-3 h-5 w-3/4 rounded bg-surface-high" />
                <div className="h-4 w-1/2 rounded bg-surface-high" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <section className="app-empty-state">
            <h2 className="text-xl font-bold text-app-text">No posts yet</h2>
            <p className="mt-2 text-sm text-app-muted">
              Be the first to start a discussion.
            </p>
            <Link className="app-button-primary mt-5" to="/create-post">
              Create a post
            </Link>
          </section>
        ) : (
          <div className="space-y-4">
            {posts.map((post) => (
              <DiscussionCard
                key={post.id}
                onUpvote={handleUpvote}
                post={post}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
