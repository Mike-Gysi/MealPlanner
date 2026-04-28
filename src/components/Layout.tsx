import { useEffect, useState } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const nav = [
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/shopping', label: 'Shopping', icon: '🛒' },
  { to: '/todos', label: 'Todos', icon: '✅' },
  { to: '/recipes', label: 'Recipes', icon: '🍽️' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Layout() {
  const [username, setUsername] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUsername(data.user?.user_metadata?.username ?? '')
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUsername(session?.user?.user_metadata?.username ?? '')
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  return (
    <div className="h-full bg-zinc-950 flex flex-col">
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex-shrink-0 z-40">
        <span
          className="text-lg font-bold text-green-400 tracking-tight cursor-pointer"
          onClick={() => navigate('/')}
        >🐝 The Bee Hive</span>
        {username && (
          <p className="text-xs text-zinc-500 mt-0.5">
            Hello <span className="text-zinc-300 font-medium">{username}</span>, welcome to the Bee Hive 🐝
          </p>
        )}
      </header>

      <main className="flex-1 overflow-y-auto min-h-0 main-content">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 flex z-40 bottom-nav">
        {nav.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2.5 text-xs gap-0.5 transition-colors ${
                isActive ? 'text-green-400 font-semibold' : 'text-zinc-500'
              }`
            }
          >
            <span className="text-xl leading-none">{icon}</span>
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
