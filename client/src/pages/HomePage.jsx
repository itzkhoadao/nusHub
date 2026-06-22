// useState stores what the user types.
// fetch() sends data requests to your Express backend.
// localStorage remembers the logged-in user after refresh.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AppShell from "../components/layout/AppShell";
import AiAssistantCard from "../components/ui/AiAssistantCard";
import DiscussionCard from "../components/ui/DiscussionCard";

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
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("user"));

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

      const token = localStorage.getItem("token");
      const res = await fetch(`http://localhost:5000/api/posts?${params}`, {
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
    const token = localStorage.getItem("token");
    const res = await fetch(`http://localhost:5000/api/posts/${postId}/upvote`, {
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

          {/* Right sidebar helper links inspired by the Stitch dashboard design */}
          <section className="app-card p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-app-muted">
              Quick Links & Topics
            </h2>
            <div className="space-y-3 text-sm font-semibold text-app-text">
              <Link className="block hover:text-primary" to="/">
                CS1101S Discussion
              </Link>
              <Link className="block hover:text-primary" to="/">
                UTown Housing
              </Link>
              <Link className="block hover:text-primary" to="/">
                NUS Bus Updates
              </Link>
            </div>
          </section>
        </div>
      }
      user={user}
    >
      <div className="space-y-6">
        {/* Hero summary: tells the user what this feed is for */}
        <section className="rounded-2xl bg-primary px-6 py-7 text-white shadow-soft">
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
        <section className="app-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-app-muted">
                Browse Feed
              </h2>
              <p className="mt-1 text-sm text-app-muted">
                Use the top search bar, then refine by sort or topic.
              </p>
            </div>

            <div className="flex w-fit rounded-lg border border-surface-variant bg-surface-low p-1">
              {["recent", "popular"].map((option) => (
                <button
                  className={`rounded-md px-4 py-2 text-sm font-bold capitalize transition-colors ${
                    sort === option
                      ? "bg-primary text-white"
                      : "text-app-muted hover:text-primary"
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
                    ? "border-primary bg-primary text-white"
                    : "border-surface-variant bg-white text-app-muted hover:border-primary hover:text-primary"
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
          <section className="app-card p-10 text-center">
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
