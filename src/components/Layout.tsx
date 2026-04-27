import { Outlet, NavLink } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const nav = [
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/shopping', label: 'Shopping', icon: '🛒' },
  { to: '/recipes', label: 'Recipes', icon: '🍽️' },
]

export default function Layout() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <span className="text-lg font-bold text-green-700">MealPlanner</span>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-40">
        {nav.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center py-2 text-xs gap-0.5 transition-colors ${
                isActive ? 'text-green-700 font-semibold' : 'text-gray-500'
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
