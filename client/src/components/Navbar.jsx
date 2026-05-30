import { Link, useNavigate } from 'react-router-dom'

export default function Navbar() {
    const navigate = useNavigate()
    const user = JSON.parse(localStorage.getItem('user'))

    const handleLogout = () => {
        // Clear everything from localStorage
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        navigate('/login')
    }

    return (
        <nav className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center sticky top-0 z-50">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-sm">N</span>
                </div>
                <span className="text-lg font-bold text-gray-800">NUSHub</span>
            </Link>

            {/* Nav links */}
            <div className="flex items-center gap-6">
                <Link
                    to="/"
                    className="text-sm text-gray-500 hover:text-blue-600 transition-colors"
                >
                    Forum
                </Link>
                <Link
                    to="/groups"
                    className="text-sm text-gray-500 hover:text-blue-600 transition-colors"
                >
                    Study Groups
                </Link>
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
                <Link
                    to="/create-post"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                    + New Post
                </Link>
                <Link to="/profile">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-sm font-bold hover:bg-blue-200 transition-colors">
                        {user?.username?.charAt(0).toUpperCase()}
                    </div>
                </Link>
                <button
                    onClick={handleLogout}
                    className="text-sm text-gray-400 hover:text-red-500 transition-colors"
                >
                    Logout
                </button>
            </div>
        </nav>
    )
}