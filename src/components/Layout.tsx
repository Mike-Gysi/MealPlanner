import { Outlet, NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const nav = [
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/shopping', label: 'Shopping', icon: '🛒' },
  { to: '/recipes', label: 'Recipes', icon: '🍽️' },
]

export default function Layout() {
  return (
    <div className="h-full bg-zinc-950 flex flex-col">
      <header className="bg-zinc-900 border-b border-zinc-800 px-4 py-3 flex items-center justify-between flex-shrink-0 z-40">
        <span className="text-lg font-bold text-green-400 tracking-tight">MealPlanner</span>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-16 min-h-0">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 flex z-40">
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
