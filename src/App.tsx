import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { supabase } from './lib/supabase'
import type { Session } from '@supabase/supabase-js'
import { isPast, isToday, parseISO, format } from 'date-fns'
import Layout from './components/Layout'
import Login from './pages/Login'
import Home from './pages/Home'
import CalendarPage from './pages/CalendarPage'
import ShoppingList from './pages/ShoppingList'
import Recipes from './pages/Recipes'
import Todos from './pages/Todos'
import Settings from './pages/Settings'
import type { Todo } from './types'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [overdueTodos, setOverdueTodos] = useState<Todo[]>([])
  const [showOverdue, setShowOverdue] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s)
      if (s) {
        upsertProfile(s)
        checkOverdue()
      }
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  async function upsertProfile(s: Session) {
    const username = s.user.user_metadata?.username
    if (!username) return
    await supabase.from('profiles').upsert({ id: s.user.id, username }, { onConflict: 'id' })
  }

  async function checkOverdue() {
    const { data } = await supabase.from('todos').select('*').eq('completed', false)
    const overdue = (data ?? []).filter((t: Todo) => {
      const due = parseISO(t.due_date)
      return isPast(due) && !isToday(due)
    })
    if (overdue.length > 0) {
      setOverdueTodos(overdue)
      setShowOverdue(true)
    }
  }

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="w-8 h-8 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        {!session ? (
          <>
            <Route path="/login" element={<Login />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={<Home />} />
            <Route element={<Layout />}>
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/shopping" element={<ShoppingList />} />
              <Route path="/todos" element={<Todos />} />
              <Route path="/recipes" element={<Recipes />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>

      {showOverdue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-zinc-900 border border-red-500/30 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-2xl">⚠️</span>
              <h2 className="text-lg font-bold text-red-400">Overdue Todos</h2>
            </div>
            <p className="text-zinc-400 text-sm mb-4">The following tasks are past their due date:</p>
            <div className="flex flex-col gap-2 mb-5">
              {overdueTodos.map(todo => (
                <div key={todo.id} className="bg-zinc-800 rounded-xl px-3 py-2.5">
                  <p className="text-sm font-medium text-zinc-100">{todo.name}</p>
                  <p className="text-xs text-red-400 mt-0.5">
                    Due {format(parseISO(todo.due_date), 'd MMM yyyy')} · {todo.assigned_to === 'all' ? 'Everyone' : todo.assigned_to}
                  </p>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowOverdue(false)}
              className="w-full bg-zinc-700 hover:bg-zinc-600 text-zinc-100 rounded-xl py-2.5 text-sm font-semibold transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </BrowserRouter>
  )
}
