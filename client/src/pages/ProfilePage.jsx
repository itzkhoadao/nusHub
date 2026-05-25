import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function ProfilePage() {
  const [profileData, setProfileData] = useState(null);
  const [activeTab, setActiveTab] = useState("posts"); // switch between viewing posts and comments
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("user"));

  // tell user to log in if they have not, if logged in, show their profile page
  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem("token");

        const res = await fetch("http://localhost:5000/api/users/me", {
          headers: { Authorization: `Bearer ${token}` },
        });

        const data = await res.json();
        setProfileData(data);
      } catch (err) {
        console.error("Failed to fetch profile:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading profile...</p>
      </div>
    );
  }

  const { user: profileUser, posts, comments } = profileData;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <div className="bg-white border-b px-6 py-4">
        <Link to="/" className="text-blue-600 text-sm hover:underline">
          ← Back to forum
        </Link>
      </div>

      <div className="max-w-2xl mx-auto p-6">
        {/* Profile card */}
        <div className="bg-white border rounded-lg p-6 mb-6">
          {/* Avatar circle */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-bold">
              {profileUser.username.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-800">
                {profileUser.username}
              </h1>
              <p className="text-sm text-gray-500">{profileUser.email}</p>
              <p className="text-xs text-gray-400 mt-1">
                Joined {new Date(profileUser.created_at).toLocaleDateString()}
              </p>
            </div>
          </div>

          {/* Stats row */}
          <div className="flex gap-6 mt-6 pt-4 border-t">
            <div className="text-center">
              <div className="text-xl font-bold text-gray-800">
                {posts.length}
              </div>
              <div className="text-xs text-gray-400">Posts</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-gray-800">
                {comments.length}
              </div>
              <div className="text-xs text-gray-400">Comments</div>
            </div>
            <div className="text-center">
              <div className="text-xl font-bold text-gray-800">
                {posts.reduce((sum, p) => sum + parseInt(p.upvotes), 0)}
              </div>
              <div className="text-xs text-gray-400">Post upvotes</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b">
          <button
            onClick={() => setActiveTab("posts")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "posts"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Posts ({posts.length})
          </button>
          <button
            onClick={() => setActiveTab("comments")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "comments"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Comments ({comments.length})
          </button>
        </div>

        {/* Posts tab */}
        {activeTab === "posts" && (
          <div>
            {posts.length === 0 ? (
              <p className="text-center text-gray-400 py-8">
                No posts yet.{" "}
                <Link
                  to="/create-post"
                  className="text-blue-600 hover:underline"
                >
                  Create your first post!
                </Link>
              </p>
            ) : (
              posts.map((post) => (
                <Link
                  to={`/posts/${post.id}`}
                  key={post.id}
                  className="block bg-white border rounded-lg p-4 mb-3 hover:shadow transition-shadow"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded-full">
                        {post.topic}
                      </span>
                      <h3 className="font-medium text-gray-800 mt-2">
                        {post.is_anonymous ? (
                          <span className="text-gray-400 italic">
                            Posted anonymously
                          </span>
                        ) : (
                          post.title
                        )}
                      </h3>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(post.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-gray-400 text-sm">
                      <span>▲</span>
                      <span>{post.upvotes}</span>
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}

        {/* Comments tab */}
        {activeTab === "comments" && (
          <div>
            {comments.length === 0 ? (
              <p className="text-center text-gray-400 py-8">No comments yet.</p>
            ) : (
              comments.map((comment) => (
                <Link
                  to={`/posts/${comment.post_id}`}
                  key={comment.id}
                  className="block bg-white border rounded-lg p-4 mb-3 hover:shadow transition-shadow"
                >
                  <p className="text-sm text-gray-700">
                    {comment.is_anonymous ? (
                      <span className="text-gray-400 italic">
                        Commented anonymously
                      </span>
                    ) : (
                      comment.content
                    )}
                  </p>
                  <div className="text-xs text-gray-400 mt-2 flex gap-3">
                    <span>on: {comment.post_title}</span>
                    <span>·</span>
                    <span>
                      {new Date(comment.created_at).toLocaleDateString()}
                    </span>
                    <span>·</span>
                    <span>▲ {comment.upvotes}</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
