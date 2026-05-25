import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";

export default function GroupDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [groupData, setGroupData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isMember, setIsMember] = useState(false);
  const [joining, setJoining] = useState(false);

  const user = JSON.parse(localStorage.getItem("user"));

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const fetchGroup = async () => {
      try {
        const res = await fetch(`http://localhost:5000/api/groups/${id}`); // request
        const data = await res.json(); // get response

        if (!res.ok) {
          // not successful, go back to groups page
          navigate("/groups");
          return;
        }

        setGroupData(data);

        // check if current user is already a member
        const alreadyMember = data.members.some((m) => m.id === user.id);
        setIsMember(alreadyMember);
      } catch (err) {
        console.error("Failed to fetch group:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchGroup();
  }, [id]);

  const handleJoinLeave = async () => {
    setJoining(true);

    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`http://localhost:5000/api/groups/${id}/join`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setIsMember(data.joined);

      // get the group we just handled
      const groupRes = await fetch(`http://localhost:5000/api/groups/${id}`);
      const groupData = await groupRes.json();
      setGroupData(groupData);
    } catch (err) {
      console.error("Failed to join/leave group:", err);
    } finally {
      setJoining(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading group...</p>
      </div>
    );
  }

  const { group, members } = groupData;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Navbar */}
      <div className="bg-white border-b px-6 py-4">
        <Link to="/groups" className="text-blue-600 text-sm hover:underline">
          ← Back to groups
        </Link>
      </div>

      <div className="max-w-2xl mx-auto p-6">
        {/* Group info card */}
        <div className="bg-white border rounded-lg p-6 mb-6">
          <div className="flex justify-between items-start">
            <div>
              {group.module_code && (
                <span className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded-full">
                  {group.module_code}
                </span>
              )}
              <h1 className="text-xl font-bold text-gray-800 mt-2">
                {group.name}
              </h1>
              {group.description && (
                <p className="text-gray-600 mt-2 text-sm leading-relaxed">
                  {group.description}
                </p>
              )}
              <p className="text-xs text-gray-400 mt-3">
                Created by {group.creator_name || "Anonymous"}· {members.length}{" "}
                member{members.length !== 1 ? "s" : ""}
              </p>
            </div>

            {/* Join/Leave button */}
            <button
              onClick={handleJoinLeave}
              disabled={joining}
              className={`px-4 py-2 rounded text-sm font-medium ml-4 flex-shrink-0 ${
                isMember
                  ? "border border-red-300 text-red-500 hover:bg-red-50"
                  : "bg-blue-600 text-white hover:bg-blue-700"
              } disabled:opacity-50`}
            >
              {joining ? "..." : isMember ? "Leave group" : "Join group"}
            </button>
          </div>
        </div>

        {/* Members list */}
        <h2 className="font-semibold text-gray-700 mb-4">
          Members ({members.length})
        </h2>

        <div className="bg-white border rounded-lg divide-y">
          {members.map((member) => (
            <div key={member.id} className="flex items-center gap-3 p-4">
              {/* Avatar circle */}
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-bold flex-shrink-0">
                {member.username.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {member.username}
                  {member.id === group.creator_id && (
                    <span className="ml-2 text-xs bg-yellow-50 text-yellow-600 px-2 py-0.5 rounded-full">
                      Creator
                    </span>
                  )}
                  {member.id === user.id && (
                    <span className="ml-2 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                      You
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-400">
                  Joined {new Date(member.joined_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
