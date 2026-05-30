import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import Navbar from "../components/Navbar";

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
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center py-20">
          <p className="text-gray-400">Loading profile...</p>
        </div>
      </div>
    )
  }


  const { user: profileUser, posts, comments } = profileData;

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="max-w-2xl mx-auto px-4 py-6">

        {/* Profile card */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center text-white text-2xl font-bold shadow-sm">
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

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-gray-50">
            {[
              { label: 'Posts', value: posts.length },
              { label: 'Comments', value: comments.length },
              { label: 'Upvotes received', value: posts.reduce((sum, p) => sum + parseInt(p.upvotes), 0) }
            ].map(stat => (
              <div key={stat.label} className="text-center bg-gray-50 rounded-xl p-3">
                <div className="text-2xl font-bold text-blue-600">{stat.value}</div>
                <div className="text-xs text-gray-400 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1 mb-5 w-fit">
          {['posts', 'comments'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${activeTab === tab
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:text-gray-700'
                }`}
            >
              {tab} ({tab === 'posts' ? posts.length : comments.length})
            </button>
          ))}
        </div>

        {/* Posts tab */}
        {activeTab === 'posts' && (
          posts.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-gray-400 text-sm">No posts yet.</p>
              <Link
                to="/create-post"
                className="inline-block mt-3 text-blue-600 text-sm hover:underline"
              >
                Create your first post →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {posts.map(post => (
                <Link
                  to={`/posts/${post.id}`}
                  key={post.id}
                  className="block bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-all"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {post.topic}
                      </span>
                      <p className="font-medium text-gray-800 text-sm mt-2">
                        {post.is_anonymous
                          ? <span className="italic text-gray-400">Posted anonymously</span>
                          : post.title
                        }
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(post.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-400">
                      <span>▲</span>
                      <span>{post.upvotes}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}

        {/* Comments tab */}
        {activeTab === 'comments' && (
          comments.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-12">No comments yet.</p>
          ) : (
            <div className="space-y-3">
              {comments.map(comment => (
                <Link
                  to={`/posts/${comment.post_id}`}
                  key={comment.id}
                  className="block bg-white border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-all"
                >
                  <p className="text-sm text-gray-700">
                    {comment.is_anonymous
                      ? <span className="italic text-gray-400">Commented anonymously</span>
                      : comment.content
                    }
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                    <span>on: {comment.post_title}</span>
                    <span>·</span>
                    <span>{new Date(comment.created_at).toLocaleDateString()}</span>
                    <span>·</span>
                    <span>▲ {comment.upvotes}</span>
                  </div>
                </Link>
              ))}
            </div>
          )
        )}

      </div>
    </div>
  );
}
