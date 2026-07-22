import { Link, useNavigate } from 'react-router-dom'
import Logo from './Logo'
import UserAvatar from './ui/UserAvatar'
import { clearAuthSession, getStoredUser } from '../utils/authStorage'

export default function Navbar() {
    const navigate = useNavigate()
    const user = getStoredUser()

    const handleLogout = () => {
        // Clear this tab's auth session.
        clearAuthSession()
        navigate('/login')
    }

    return (
        <nav className="bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center sticky top-0 z-50">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2">
                <Logo
                    className="flex items-center gap-2"
                    iconClassName="h-8 w-8"
                    textClassName="text-lg font-black text-gray-800"
                />
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
                    <UserAvatar
                        avatarUrl={user?.avatar_url}
                        className="h-8 w-8 text-sm transition-colors hover:bg-blue-200"
                        name={user?.username || 'NUSHub user'}
                        userId={user?.id}
                    />
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
