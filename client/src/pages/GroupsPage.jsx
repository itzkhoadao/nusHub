import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";

export default function GroupsPage() {
  const [groups, setGroups] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newGroup, setNewGroup] = useState({
    name: "",
    module_code: "",
    description: "",
  });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchGroups = async () => {
      try {
        let url = "http://localhost:5000/api/groups";
        if (search) {
          url += `?search=${search}`;
        }
        const res = await fetch(url); // ask for GET request from backend
        const data = await res.json(); // extract JSON from response
        setGroups(data);
      } catch (err) {
        console.error("Failed to fetch groups:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchGroups();
  }, [search]);

  const handleCreateGroup = async () => {
    if (!newGroup.name.trim()) {
      setError("Group name is required");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const token = localStorage.getItem("token");

      // HTTP post request
      const res = await fetch("http://localhost:5000/api/groups", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newGroup), // convert newGroup object to JSON
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        return;
      }

      // redirect to the new group's page
      navigate(`/groups/${data.id}`);
    } catch (err) {
      setError("Something went wrong:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center">
        <Link to="/" className="text-blue-600 text-sm hover:underline">
          ← Back to forum
        </Link>
        <h1 className="text-lg font-bold text-gray-800">Study Groups</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700"
        >
          + New Group
        </button>
      </div>

      <div className="max-w-2xl mx-auto p-6">
        {/* Create group form */}
        {showCreateForm && (
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="font-semibold text-gray-800 mb-4">
              Create a Study Group
            </h2>

            {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">
                {error}
              </div>
            )}

            <input
              className="w-full border border-gray-300 rounded p-3 mb-3 text-sm"
              placeholder="Group name (e.g. CS2103T Study Group)"
              value={newGroup.name}
              onChange={(e) =>
                setNewGroup({ ...newGroup, name: e.target.value })
              }
            />
            <input
              className="w-full border border-gray-300 rounded p-3 mb-3 text-sm"
              placeholder="Module code (e.g. CS2103T) — optional"
              value={newGroup.module_code}
              onChange={(e) =>
                setNewGroup({ ...newGroup, module_code: e.target.value })
              }
            />
            <textarea
              className="w-full border border-gray-300 rounded p-3 mb-4 text-sm h-24 resize-none"
              placeholder="Description — what is this group for?"
              value={newGroup.description}
              onChange={(e) =>
                setNewGroup({ ...newGroup, description: e.target.value })
              }
            />

            <div className="flex gap-2">
              <button
                onClick={handleCreateGroup}
                disabled={creating}
                className="bg-blue-600 text-white px-4 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create Group"}
              </button>
              <button
                onClick={() => setShowCreateForm(false)}
                className="border border-gray-300 text-gray-600 px-4 py-2 rounded text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="flex gap-2 mb-6">
          <input
            className="flex-1 border border-gray-300 rounded p-2 text-sm"
            placeholder="Search groups by name or module..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Groups list */}
        {loading ? (
          <p className="text-center text-gray-400 py-8">Loading groups...</p>
        ) : groups.length === 0 ? (
          <p className="text-center text-gray-400 py-8">
            No groups yet. Create the first one!
          </p>
        ) : (
          groups.map((group) => (
            <Link
              to={`/groups/${group.id}`}
              key={group.id}
              className="block bg-white border rounded-lg p-4 mb-3 hover:shadow transition-shadow"
            >
              <div className="flex justify-between items-start">
                <div>
                  {group.module_code && (
                    <span className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded-full">
                      {group.module_code}
                    </span>
                  )}
                  <h2 className="font-semibold text-gray-800 mt-2">
                    {group.name}
                  </h2>
                  {group.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                      {group.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    Created by {group.creator_name || "Anonymous"}
                  </p>
                </div>
                <div className="text-right ml-4">
                  <div className="text-lg font-bold text-gray-700">
                    {group.member_count}
                  </div>
                  <div className="text-xs text-gray-400">members</div>
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
