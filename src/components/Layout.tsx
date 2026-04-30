import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const nav = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/shopping', label: 'Shopping', icon: '🛒' },
  { to: '/todos', label: 'Todos', icon: '✅' },
  { to: '/recipes', label: 'Recipes', icon: '🍽️' },
]

const menuItems = [
  { to: '/messages', label: 'Messages', icon: '💬' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
  { to: '/household', label: 'Household', icon: '🏡' },
  { to: '/notifications', label: 'Notifications', icon: '🔔' },
  { to: '/leaderboard', label: 'Leaderboard', icon: '🏆' },
]

export default function Layout() {
  const [username, setUsername] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [unreadCount, setUnreadCount] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUsername(data.user?.user_metadata?.username ?? '')
      const uid = data.user?.id ?? ''
      setCurrentUserId(uid)
      if (uid) fetchUnread(uid)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUsername(session?.user?.user_metadata?.username ?? '')
      const uid = session?.user?.id ?? ''
      setCurrentUserId(uid)
      if (uid) fetchUnread(uid)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    const channel = supabase.channel('layout-unread')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `recipient_id=eq.${currentUserId}`,
      }, () => fetchUnread(currentUserId))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUserId])

  async function fetchUnread(userId: string) {
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', userId)
      .eq('read', false)
    setUnreadCount(count ?? 0)
  }

  const initials = username ? username.slice(0, 2).toUpperCase() : '?'

  function handleMenuNav(to: string) {
    setMenuOpen(false)
    navigate(to)
  }

  return (
    <div className="h-full bg-zinc-950 flex flex-col">
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex-shrink-0 z-40 flex items-center justify-between">
        <div>
          {location.pathname !== '/' && (
            <span
              className="text-lg font-bold text-green-400 tracking-tight cursor-pointer"
              onClick={() => navigate('/')}
            >🐝 The Bee Hive</span>
          )}
        </div>
        <button
          onClick={() => setMenuOpen(true)}
          className="relative w-9 h-9 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center flex-shrink-0 ml-3"
          aria-label="Open menu"
        >
          <span className="text-sm font-bold text-green-400">{initials}</span>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center px-0.5 leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>
      </header>

      <main className="flex-1 overflow-y-auto min-h-0 main-content">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 flex z-40 bottom-nav">
        {nav.map(({ to, label, icon }) => {
          if (to === '/calendar') {
            const isActive = location.pathname === '/calendar'
            const calMode = new URLSearchParams(location.search).get('mode') ?? 'meals'
            const isTodos = calMode === 'todos'
            return (
              <button
                key={to}
                onClick={() => {
                  if (isActive) {
                    navigate(`/calendar?mode=${isTodos ? 'meals' : 'todos'}`)
                  } else {
                    navigate('/calendar')
                  }
                }}
                className={`flex-1 flex flex-col items-center py-2.5 text-xs gap-0.5 transition-colors ${
                  isActive ? 'text-green-400 font-semibold' : 'text-zinc-500'
                }`}
              >
                <span className="text-xl leading-none">{isActive && isTodos ? '✅' : icon}</span>
                {isActive ? (isTodos ? 'Todos Cal' : 'Meals Cal') : label}
              </button>
            )
          }
          return (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center py-2.5 text-xs gap-0.5 transition-colors ${
                  isActive ? 'text-green-400 font-semibold' : 'text-zinc-500'
                }`
              }
            >
              <span className="text-xl leading-none">{icon}</span>
              {label}
            </NavLink>
          )
        })}
      </nav>

      {/* Burger menu overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-50 flex"
          onClick={() => setMenuOpen(false)}
        >
          <div className="flex-1 bg-black/50" />

          <div
            className="w-64 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Drawer header */}
            <div className="px-5 py-5 border-b border-zinc-800 flex items-center gap-3">
              <div className="relative w-10 h-10 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center flex-shrink-0">
                <span className="text-base font-bold text-green-400">{initials}</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center px-0.5 leading-none">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-zinc-100 truncate flex-1">{username || 'User'}</p>
              <button
                onClick={() => setMenuOpen(false)}
                className="text-zinc-600 hover:text-zinc-300 text-2xl leading-none transition-colors flex-shrink-0"
                aria-label="Close menu"
              >
                ×
              </button>
            </div>

            {/* Menu items */}
            <div className="flex-1 flex flex-col py-2">
              {menuItems.map(({ to, label, icon }) => (
                <button
                  key={to}
                  onClick={() => handleMenuNav(to)}
                  className="flex items-center gap-3 px-5 py-3.5 text-zinc-300 hover:text-zinc-100 hover:bg-zinc-800 transition-colors text-left w-full"
                >
                  <span className="text-xl leading-none w-7 text-center">{icon}</span>
                  <span className="text-sm font-medium flex-1">{label}</span>
                  {to === '/messages' && unreadCount > 0 && (
                    <span className="min-w-[20px] h-5 bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center px-1 leading-none">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Sign out */}
            <div className="border-t border-zinc-800 p-4">
              <button
                onClick={() => supabase.auth.signOut()}
                className="w-full flex items-center gap-3 px-3 py-3 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-colors rounded-xl"
              >
                <span className="text-xl leading-none w-7 text-center">↩</span>
                <span className="text-sm font-medium">Sign out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
