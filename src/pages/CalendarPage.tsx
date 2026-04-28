import { useEffect, useState } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, addWeeks, addDays,
  isSameMonth, isToday, isPast, parseISO, subDays,
} from 'date-fns'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import type { CalendarEntry, Recipe, RecipeIngredient, Todo, Profile } from '../types'

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const
type MealType = typeof MEAL_TYPES[number]

const MEAL_COLORS: Record<MealType, string> = {
  breakfast: 'bg-amber-500',
  lunch: 'bg-blue-500',
  dinner: 'bg-violet-600',
}

const MEAL_BTN_ACTIVE: Record<MealType, string> = {
  breakfast: 'bg-amber-500 text-zinc-950',
  lunch: 'bg-blue-500 text-white',
  dinner: 'bg-violet-600 text-white',
}

type ViewMode = 'month' | 'week' | 'day'

const PROFILE_COLORS = ['#3b82f6', '#a855f7', '#f97316', '#ec4899', '#14b8a6', '#ef4444', '#eab308', '#06b6d4']

function getProfileColor(username: string, profiles: Profile[]): string {
  if (username === 'all') return '#22c55e'
  const idx = profiles.findIndex(p => p.username === username)
  return PROFILE_COLORS[Math.max(0, idx) % PROFILE_COLORS.length]
}

export default function CalendarPage() {
  const [current, setCurrent] = useState(new Date())
  const [view, setView] = useState<ViewMode>('week')
  const [calMode, setCalMode] = useState<'meals' | 'todos'>('meals')
  const [entries, setEntries] = useState<CalendarEntry[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [todos, setTodos] = useState<Todo[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [selectedUser, setSelectedUser] = useState<string>('all')
  const [modal, setModal] = useState<{ date: string; meal: MealType; entry: CalendarEntry | null } | null>(null)
  const [todoPopup, setTodoPopup] = useState<{ type: 'day'; date: Date; todos: Todo[] } | { type: 'todo'; todo: Todo } | null>(null)

  useEffect(() => { fetchEntries(); fetchRecipes(); fetchTodosAndProfiles() }, [])

  async function fetchEntries() {
    const { data } = await supabase
      .from('calendar_entries')
      .select('*, recipe:recipes(id, name, ingredients:recipe_ingredients(*))')
    setEntries(data ?? [])
  }

  async function fetchRecipes() {
    const { data } = await supabase.from('recipes').select('*, ingredients:recipe_ingredients(*)').order('name')
    setRecipes(data ?? [])
  }

  async function fetchTodosAndProfiles() {
    const [{ data: todosData }, { data: profilesData }] = await Promise.all([
      supabase.from('todos').select('*').eq('completed', false).order('due_date'),
      supabase.from('profiles').select('*'),
    ])
    setTodos(todosData ?? [])
    setProfiles(profilesData ?? [])
  }

  function getEntry(date: Date, meal: MealType): CalendarEntry | null {
    const d = format(date, 'yyyy-MM-dd')
    return entries.find(e => e.date === d && e.meal_type === meal) ?? null
  }

  function getTodosForDate(date: Date): Todo[] {
    const d = format(date, 'yyyy-MM-dd')
    const filtered = selectedUser === 'all'
      ? todos
      : todos.filter(t => t.assigned_to === selectedUser || t.assigned_to === 'all')
    return filtered.filter(t => t.due_date === d)
  }

  function openSlot(date: Date, meal: MealType) {
    setModal({ date: format(date, 'yyyy-MM-dd'), meal, entry: getEntry(date, meal) })
  }

  function openDay(date: Date) {
    setCurrent(date)
    setView('day')
  }

  function navigate(dir: 1 | -1) {
    if (view === 'month') setCurrent(d => addMonths(d, dir))
    else if (view === 'week') setCurrent(d => addWeeks(d, dir))
    else setCurrent(d => addDays(d, dir))
  }

  function title() {
    if (view === 'month') return format(current, 'MMMM yyyy')
    if (view === 'week') {
      const start = startOfWeek(current, { weekStartsOn: 1 })
      const end = endOfWeek(current, { weekStartsOn: 1 })
      return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`
    }
    return format(current, 'EEEE, d MMMM yyyy')
  }

  function daysForView(): Date[] {
    if (view === 'month') {
      const start = startOfWeek(startOfMonth(current), { weekStartsOn: 1 })
      const end = endOfWeek(endOfMonth(current), { weekStartsOn: 1 })
      return eachDayOfInterval({ start, end })
    }
    if (view === 'week') {
      const start = startOfWeek(current, { weekStartsOn: 1 })
      const end = endOfWeek(current, { weekStartsOn: 1 })
      return eachDayOfInterval({ start, end })
    }
    return [current]
  }

  const days = daysForView()

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-3 pt-3 pb-2 flex flex-col gap-2 flex-shrink-0 z-30">
        <div className="flex items-center gap-2">
          <span className="flex-1 text-sm font-semibold text-zinc-100">{title()}</span>
          <button onClick={() => setCurrent(new Date())} className="text-xs text-green-400 font-medium border border-green-500/30 rounded-lg px-2 py-1 hover:bg-green-500/10 transition-colors">Today</button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-zinc-800 rounded-xl p-1">
          <button
            onClick={() => setCalMode('meals')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${calMode === 'meals' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Meal Planning
          </button>
          <button
            onClick={() => setCalMode('todos')}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${calMode === 'todos' ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            Todos
          </button>
        </div>

        {/* User filter (todos mode only) */}
        {calMode === 'todos' && profiles.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button
              onClick={() => setSelectedUser('all')}
              className="flex-shrink-0 text-xs px-3 py-1 rounded-full font-medium transition-all border"
              style={selectedUser === 'all'
                ? { backgroundColor: '#22c55e', borderColor: '#22c55e', color: '#fff' }
                : { borderColor: '#22c55e', color: '#22c55e' }}
            >
              Everyone
            </button>
            {profiles.map((p, i) => {
              const color = PROFILE_COLORS[i % PROFILE_COLORS.length]
              const active = selectedUser === p.username
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedUser(active ? 'all' : p.username)}
                  className="flex-shrink-0 text-xs px-3 py-1 rounded-full font-medium transition-all border"
                  style={active
                    ? { backgroundColor: color, borderColor: color, color: '#fff' }
                    : { borderColor: color, color: color }}
                >
                  {p.username}
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Calendar body */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        {calMode === 'meals' ? (
          <>
            {view === 'month' && <MonthView days={days} current={current} getEntry={getEntry} openDay={openDay} />}
            {view === 'week' && <WeekView days={days} getEntry={getEntry} openDay={openDay} openSlot={openSlot} />}
            {view === 'day' && <DayView day={current} getEntry={getEntry} openSlot={openSlot} />}
          </>
        ) : (
          <>
            {view === 'month' && <TodoMonthView days={days} current={current} getTodos={getTodosForDate} profiles={profiles} openDay={d => setTodoPopup({ type: 'day', date: d, todos: getTodosForDate(d) })} onTodoClick={t => setTodoPopup({ type: 'todo', todo: t })} />}
            {view === 'week' && <TodoWeekView days={days} getTodos={getTodosForDate} profiles={profiles} openDay={d => setTodoPopup({ type: 'day', date: d, todos: getTodosForDate(d) })} onTodoClick={t => setTodoPopup({ type: 'todo', todo: t })} />}
            {view === 'day' && <TodoDayView day={current} getTodos={getTodosForDate} profiles={profiles} onTodoClick={t => setTodoPopup({ type: 'todo', todo: t })} />}
          </>
        )}
      </div>

      {/* Bottom navigation arrows + view toggle */}
      <div className="bg-zinc-900 border-t border-zinc-800 flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-14 h-14 flex items-center justify-center rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-3xl font-light transition-colors"
        >
          ‹
        </button>
        <div className="flex bg-zinc-800 rounded-xl p-1 gap-1">
          {(['month', 'week', 'day'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-2 text-sm font-medium rounded-lg capitalize transition-colors ${
                view === v ? 'bg-zinc-600 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          onClick={() => navigate(1)}
          className="w-14 h-14 flex items-center justify-center rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-3xl font-light transition-colors"
        >
          ›
        </button>
      </div>

      {todoPopup && (
        <TodoPopup popup={todoPopup} profiles={profiles} onClose={() => setTodoPopup(null)} />
      )}

      {modal && (
        <MealModal
          date={modal.date}
          meal={modal.meal}
          entry={modal.entry}
          recipes={recipes}
          allEntries={entries}
          onClose={() => setModal(null)}
          onSaved={async () => { await fetchEntries(); setModal(null) }}
        />
      )}
    </div>
  )
}

// ── Month View ──────────────────────────────────────────────────────────────

interface MonthWeekProps {
  days: Date[]
  current?: Date
  getEntry: (date: Date, meal: MealType) => CalendarEntry | null
  openDay: (date: Date) => void
}

function MonthView({ days, current, getEntry, openDay }: MonthWeekProps) {
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const numWeeks = days.length / 7
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="grid grid-cols-7 border-b border-zinc-800 flex-shrink-0">
        {weekDays.map(d => (
          <div key={d} className="text-center text-xs text-zinc-600 py-2 font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1" style={{ gridTemplateRows: `repeat(${numWeeks}, 1fr)` }}>
        {days.map(day => {
          const inMonth = current ? isSameMonth(day, current) : true
          const today = isToday(day)
          const meals = MEAL_TYPES.map(m => ({ meal: m, entry: getEntry(day, m) })).filter(x => x.entry)
          return (
            <button
              key={day.toISOString()}
              onClick={() => openDay(day)}
              className={`border-b border-r border-zinc-800 p-1 flex flex-col items-start justify-start gap-0.5 transition-colors hover:bg-zinc-800/50 ${!inMonth ? 'opacity-30' : ''}`}
            >
              <div className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full mb-0.5 ${
                today ? 'bg-green-500 text-zinc-950 font-bold' : 'text-zinc-300'
              }`}>
                {format(day, 'd')}
              </div>
              {meals.map(({ meal, entry }) => {
                const label = entry?.recipe?.name ?? entry?.custom_text ?? ''
                return (
                  <span key={meal} className={`w-full truncate rounded px-1 py-0.5 text-[9px] font-medium leading-tight text-white ${MEAL_COLORS[meal]}`}>
                    {label}
                  </span>
                )
              })}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Week View ───────────────────────────────────────────────────────────────

function WeekView({ days, getEntry, openDay, openSlot }: MonthWeekProps & { openSlot: (date: Date, meal: MealType) => void }) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex border-b border-zinc-800 flex-shrink-0">
        <div className="w-8 flex-shrink-0 border-r border-zinc-800" />
        <div className="flex-1 grid grid-cols-7 divide-x divide-zinc-800">
          {days.map(day => {
            const today = isToday(day)
            return (
              <button
                key={day.toISOString()}
                onClick={() => openDay(day)}
                className="flex flex-col items-center py-3 gap-1 hover:bg-zinc-800/40 transition-colors"
              >
                <span className={`text-xs font-medium ${today ? 'text-green-400' : 'text-zinc-500'}`}>
                  {format(day, 'EEE')}
                </span>
                <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold ${
                  today ? 'bg-green-500 text-zinc-950' : 'text-zinc-200'
                }`}>
                  {format(day, 'd')}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col divide-y divide-zinc-800">
        {MEAL_TYPES.map(meal => (
          <div key={meal} className="flex flex-1 min-h-0">
            <div className="w-8 flex-shrink-0 flex items-center justify-center border-r border-zinc-800">
              <span className={`text-[9px] font-bold uppercase tracking-widest -rotate-90 whitespace-nowrap ${
                meal === 'breakfast' ? 'text-amber-500' : meal === 'lunch' ? 'text-blue-400' : 'text-violet-400'
              }`}>
                {meal}
              </span>
            </div>
            <div className="flex-1 grid grid-cols-7 divide-x divide-zinc-800">
              {days.map(day => {
                const entry = getEntry(day, meal)
                const label = entry?.recipe?.name ?? entry?.custom_text ?? null
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => openSlot(day, meal)}
                    className="flex flex-col items-center justify-center p-1.5 gap-1 hover:bg-zinc-800/50 transition-colors group"
                  >
                    {label ? (
                      <>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${MEAL_COLORS[meal]}`} />
                        <span className="text-[11px] font-medium text-zinc-200 text-center leading-tight" style={{ wordBreak: 'break-word', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {label}
                        </span>
                      </>
                    ) : (
                      <span className="text-zinc-700 group-hover:text-zinc-500 text-xl leading-none transition-colors">+</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Day View ────────────────────────────────────────────────────────────────

interface DayViewProps {
  day: Date
  getEntry: (date: Date, meal: MealType) => CalendarEntry | null
  openSlot: (date: Date, meal: MealType) => void
}

function DayView({ day, getEntry, openSlot }: DayViewProps) {
  const plannedMeals = MEAL_TYPES.map(m => ({ meal: m, entry: getEntry(day, m) }))
  const nextMeal = MEAL_TYPES.find(m => !getEntry(day, m)) ?? 'dinner'

  return (
    <div className="max-w-lg mx-auto px-4 py-4 flex flex-col gap-3 flex-1 min-h-0">
      {plannedMeals.map(({ meal, entry }) => {
        const label = entry?.recipe?.name ?? entry?.custom_text ?? null
        if (!entry) return null
        return (
          <button
            key={meal}
            onClick={() => openSlot(day, meal)}
            className={`w-full rounded-2xl p-4 text-left shadow-lg ${MEAL_COLORS[meal]}`}
          >
            <div className="text-xs font-semibold capitalize text-white/70 mb-1 uppercase tracking-wide">{meal}</div>
            <div className="text-base font-bold text-white">{label}</div>
            {entry.leftover_of && <div className="text-xs mt-1 text-white/60">↩ Leftover</div>}
          </button>
        )
      })}

      <button
        onClick={() => openSlot(day, nextMeal)}
        className="w-full rounded-2xl p-4 text-left border-2 border-dashed border-zinc-700 hover:border-green-500/50 hover:bg-green-500/5 transition-all text-zinc-600 hover:text-green-400"
      >
        + Add meal
      </button>
    </div>
  )
}

// ── Todo Month View ─────────────────────────────────────────────────────────

interface TodoViewProps {
  days: Date[]
  current?: Date
  getTodos: (date: Date) => Todo[]
  profiles: Profile[]
  openDay: (date: Date) => void
  onTodoClick: (todo: Todo) => void
}

function TodoMonthView({ days, current, getTodos, profiles, openDay, onTodoClick }: TodoViewProps) {
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const numWeeks = days.length / 7
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="grid grid-cols-7 border-b border-zinc-800 flex-shrink-0">
        {weekDays.map(d => (
          <div key={d} className="text-center text-xs text-zinc-600 py-2 font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1" style={{ gridTemplateRows: `repeat(${numWeeks}, 1fr)` }}>
        {days.map(day => {
          const inMonth = current ? isSameMonth(day, current) : true
          const today = isToday(day)
          const dayTodos = getTodos(day)
          return (
            <button
              key={day.toISOString()}
              onClick={() => openDay(day)}
              className={`border-b border-r border-zinc-800 p-1 flex flex-col items-start justify-start gap-0.5 transition-colors hover:bg-zinc-800/50 ${!inMonth ? 'opacity-30' : ''}`}
            >
              <div className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full mb-0.5 ${
                today ? 'bg-green-500 text-zinc-950 font-bold' : 'text-zinc-300'
              }`}>
                {format(day, 'd')}
              </div>
              {dayTodos.map(todo => {
                const overdue = isPast(parseISO(todo.due_date)) && !isToday(day)
                const color = overdue ? '#ef4444' : getProfileColor(todo.assigned_to, profiles)
                return (
                  <span
                    key={todo.id}
                    onClick={e => { e.stopPropagation(); onTodoClick(todo) }}
                    className="w-full truncate rounded px-1 py-0.5 text-[9px] font-medium leading-tight text-white cursor-pointer"
                    style={{ backgroundColor: color }}
                  >
                    {todo.name}
                  </span>
                )
              })}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Todo Week View ──────────────────────────────────────────────────────────

function TodoWeekView({ days, getTodos, profiles, openDay, onTodoClick }: Omit<TodoViewProps, 'current'>) {
  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Day headers */}
      <div className="flex border-b border-zinc-800 flex-shrink-0">
        <div className="flex-1 grid grid-cols-7 divide-x divide-zinc-800">
          {days.map(day => {
            const today = isToday(day)
            return (
              <button
                key={day.toISOString()}
                onClick={() => openDay(day)}
                className="flex flex-col items-center py-3 gap-1 hover:bg-zinc-800/40 transition-colors"
              >
                <span className={`text-xs font-medium ${today ? 'text-green-400' : 'text-zinc-500'}`}>
                  {format(day, 'EEE')}
                </span>
                <span className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold ${
                  today ? 'bg-green-500 text-zinc-950' : 'text-zinc-200'
                }`}>
                  {format(day, 'd')}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Todo columns per day */}
      <div className="flex flex-1 min-h-0 divide-x divide-zinc-800 overflow-y-auto">
        {days.map(day => {
          const dayTodos = getTodos(day)
          return (
            <div key={day.toISOString()} className="flex-1 min-w-0 p-1 flex flex-col gap-1">
              {dayTodos.length === 0 ? (
                <span className="text-zinc-800 text-xs text-center mt-2">—</span>
              ) : (
                dayTodos.map(todo => {
                  const overdue = isPast(parseISO(todo.due_date)) && !isToday(day)
                  const color = overdue ? '#ef4444' : getProfileColor(todo.assigned_to, profiles)
                  return (
                    <button
                      key={todo.id}
                      onClick={e => { e.stopPropagation(); onTodoClick(todo) }}
                      className="w-full text-left rounded px-1 py-0.5 text-[10px] font-medium leading-tight text-white truncate"
                      style={{ backgroundColor: color }}
                      title={todo.name}
                    >
                      {todo.name}
                    </button>
                  )
                })
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Todo Day View ───────────────────────────────────────────────────────────

function TodoDayView({ day, getTodos, profiles, onTodoClick }: { day: Date; getTodos: (date: Date) => Todo[]; profiles: Profile[]; onTodoClick: (todo: Todo) => void }) {
  const dayTodos = getTodos(day)
  return (
    <div className="max-w-lg mx-auto px-4 py-4 flex flex-col gap-3 overflow-y-auto">
      {dayTodos.length === 0 ? (
        <p className="text-center text-zinc-600 text-sm py-10">No todos for this day.</p>
      ) : (
        dayTodos.map(todo => {
          const overdue = isPast(parseISO(todo.due_date)) && !isToday(day)
          const color = overdue ? '#ef4444' : getProfileColor(todo.assigned_to, profiles)
          return (
            <button key={todo.id} onClick={() => onTodoClick(todo)} className="w-full text-left rounded-2xl p-4" style={{ backgroundColor: color }}>
              <p className="font-semibold text-sm text-white">{todo.name}</p>
              <p className="text-xs mt-1 text-white/70">
                {todo.assigned_to === 'all' ? 'Everyone' : todo.assigned_to}
                {todo.recurring && ' · Recurring'}
                {overdue && ' · Overdue'}
              </p>
            </button>
          )
        })
      )}
    </div>
  )
}

// ── Todo Popup ──────────────────────────────────────────────────────────────

function todoRecurLabel(todo: Todo): string {
  if (!todo.recurring || !todo.recur_type) return ''
  const n = todo.recur_interval ?? 1
  if (todo.recur_type === 'daily') return n === 1 ? 'Every day' : `Every ${n} days`
  if (todo.recur_type === 'weekly') return n === 1 ? 'Weekly' : `Every ${n} weeks`
  if (todo.recur_type === 'monthly') return n === 1 ? 'Monthly' : `Every ${n} months`
  return ''
}

function TodoPopup({
  popup,
  profiles,
  onClose,
}: {
  popup: { type: 'day'; date: Date; todos: Todo[] } | { type: 'todo'; todo: Todo }
  profiles: Profile[]
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-sm rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        {popup.type === 'day' ? (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="font-semibold text-zinc-100">
                {format(popup.date, 'EEE d MMM')} — Todos
              </h3>
              <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 text-2xl leading-none">×</button>
            </div>
            <div className="p-4 flex flex-col gap-2 max-h-80 overflow-y-auto">
              {popup.todos.length === 0 ? (
                <p className="text-center text-zinc-600 text-sm py-4">No todos for this day.</p>
              ) : (
                popup.todos.map(todo => {
                  const overdue = isPast(parseISO(todo.due_date)) && !isToday(popup.date)
                  const color = overdue ? '#ef4444' : getProfileColor(todo.assigned_to, profiles)
                  return (
                    <div key={todo.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 border-l-4" style={{ backgroundColor: color + '18', borderColor: color }}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-100">{todo.name}</p>
                        <p className="text-xs text-zinc-400 mt-0.5">
                          {todo.assigned_to === 'all' ? 'Everyone' : todo.assigned_to}
                          {overdue && ' · Overdue'}
                        </p>
                      </div>
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    </div>
                  )
                })
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
              <h3 className="font-semibold text-zinc-100 pr-4 leading-snug">{popup.todo.name}</h3>
              <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 text-2xl leading-none flex-shrink-0">×</button>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: getProfileColor(popup.todo.assigned_to, profiles) }}
                >
                  <span className="text-white text-sm font-bold">
                    {popup.todo.assigned_to === 'all' ? '★' : popup.todo.assigned_to[0].toUpperCase()}
                  </span>
                </div>
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide">Assigned to</p>
                  <p className="text-sm text-zinc-200 font-medium">
                    {popup.todo.assigned_to === 'all' ? 'Everyone' : popup.todo.assigned_to}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Due date</p>
                <p className="text-sm text-zinc-200">{format(parseISO(popup.todo.due_date), 'EEEE, d MMMM yyyy')}</p>
                {isPast(parseISO(popup.todo.due_date)) && !isToday(parseISO(popup.todo.due_date)) && (
                  <p className="text-xs text-red-400 mt-0.5">Overdue</p>
                )}
              </div>

              {popup.todo.recurring && (
                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-1">Recurring</p>
                  <p className="text-sm text-green-400">↻ {todoRecurLabel(popup.todo)}</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Meal Modal ───────────────────────────────────────────────────────────────

interface MealModalProps {
  date: string
  meal: MealType
  entry: CalendarEntry | null
  recipes: Recipe[]
  allEntries: CalendarEntry[]
  onClose: () => void
  onSaved: () => void
}

function MealModal({ date, meal, entry, recipes, allEntries, onClose, onSaved }: MealModalProps) {
  const [selectedMeal, setSelectedMeal] = useState<MealType>(meal)
  const [mode, setMode] = useState<'recipe' | 'text'>(entry?.recipe_id ? 'recipe' : 'text')
  const [recipeId, setRecipeId] = useState(entry?.recipe_id ?? '')
  const [customText, setCustomText] = useState(entry?.custom_text ?? '')
  const [leftoverOf, setLeftoverOf] = useState(entry?.leftover_of ?? '')

  function handleLeftoverChange(id: string) {
    setLeftoverOf(id)
    if (id) {
      const source = allEntries.find(e => e.id === id)
      const sourceName = source?.recipe?.name ?? source?.custom_text ?? ''
      setCustomText(`Leftover - ${sourceName}`)
      setMode('text')
    }
  }
  const [addToShopping, setAddToShopping] = useState(false)
  const [saving, setSaving] = useState(false)
  const [showIngredientPicker, setShowIngredientPicker] = useState(false)
  const [checkedIngredients, setCheckedIngredients] = useState<Set<string>>(new Set())

  const threeDaysAgo = subDays(new Date(), 3)
  const otherEntries = allEntries.filter(e =>
    e.id !== entry?.id && new Date(e.date + 'T12:00:00') >= threeDaysAgo
  )

  async function save() {
    setSaving(true)
    const payload = {
      date,
      meal_type: selectedMeal,
      recipe_id: mode === 'recipe' && recipeId ? recipeId : null,
      custom_text: mode === 'text' && customText.trim() ? customText.trim() : null,
      leftover_of: leftoverOf || null,
    }
    const mealName = mode === 'recipe'
      ? (recipes.find(r => r.id === recipeId)?.name ?? recipeId)
      : customText.trim()
    if (entry) {
      await supabase.from('calendar_entries').update(payload).eq('id', entry.id)
      logActivity('updated meal plan', 'calendar', `${selectedMeal} — ${mealName}`)
    } else {
      await supabase.from('calendar_entries').insert(payload)
      logActivity('planned meal', 'calendar', `${selectedMeal} — ${mealName}`)
    }
    setSaving(false)
    if (addToShopping && mode === 'recipe' && recipeId) {
      const recipe = recipes.find(r => r.id === recipeId)
      if (recipe?.ingredients?.length) {
        setCheckedIngredients(new Set(recipe.ingredients.map(i => i.id)))
        setShowIngredientPicker(true)
        return
      }
    }
    onSaved()
  }

  function toggleIngredient(id: string) {
    setCheckedIngredients(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function confirmIngredients() {
    const recipe = recipes.find(r => r.id === recipeId)
    if (recipe?.ingredients) {
      const filtered = recipe.ingredients.filter(i => checkedIngredients.has(i.id))
      if (filtered.length) await mergeIngredientsToShoppingList(filtered)
    }
    onSaved()
  }

  async function deleteEntry() {
    if (!entry) return
    const mealName = entry.recipe?.name ?? entry.custom_text ?? 'meal'
    await supabase.from('calendar_entries').delete().eq('id', entry.id)
    logActivity('removed meal plan', 'calendar', `${entry.meal_type} — ${mealName}`)
    onSaved()
  }

  const canSave = mode === 'recipe' ? !!recipeId : !!customText.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-zinc-100">
            {entry ? 'Edit meal' : 'Add meal'} — {format(new Date(date + 'T12:00:00'), 'EEE d MMM')}
          </h3>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 text-2xl leading-none transition-colors">×</button>
        </div>

        <div className="flex gap-2 mb-4">
          {MEAL_TYPES.map(m => (
            <button
              key={m}
              onClick={() => setSelectedMeal(m)}
              className={`flex-1 py-2 text-sm font-semibold rounded-xl capitalize transition-all ${
                selectedMeal === m ? MEAL_BTN_ACTIVE[m] : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-zinc-800 rounded-xl p-1 mb-4">
          {(['recipe', 'text'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                mode === m ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {m === 'recipe' ? 'From recipe' : 'Custom text'}
            </button>
          ))}
        </div>

        {mode === 'recipe' ? (
          <div className="mb-4">
            <select
              value={recipeId}
              onChange={e => setRecipeId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">Select a recipe…</option>
              {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {recipeId && (
              <label className="flex items-center gap-2 mt-3 text-sm text-zinc-400">
                <input type="checkbox" checked={addToShopping} onChange={e => setAddToShopping(e.target.checked)} className="rounded accent-green-500" />
                Add ingredients to shopping list
              </label>
            )}
          </div>
        ) : (
          <input
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            placeholder="What are you eating?"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 mb-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        )}

        <div className="mb-5">
          <label className="block text-xs text-zinc-600 uppercase tracking-wide mb-1.5">Leftover of (optional)</label>
          <select
            value={leftoverOf}
            onChange={e => handleLeftoverChange(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">— None —</option>
            {otherEntries.map(e => (
              <option key={e.id} value={e.id}>
                {format(new Date(e.date + 'T12:00:00'), 'EEE d MMM')} {e.meal_type} — {e.recipe?.name ?? e.custom_text}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving || !canSave}
            className="flex-1 bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-30 transition-colors"
          >
            {saving ? 'Saving…' : entry ? 'Update' : 'Add'}
          </button>
          {entry && (
            <button onClick={deleteEntry} className="px-4 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl py-2.5 text-sm transition-colors">
              Delete
            </button>
          )}
        </div>
      </div>

      {showIngredientPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
          <div className="bg-zinc-900 border border-zinc-700 w-full max-w-sm rounded-2xl p-6 shadow-2xl">
            <h3 className="font-semibold text-zinc-100 mb-1">Add to shopping list</h3>
            <p className="text-xs text-zinc-500 mb-4">Uncheck ingredients you already have at home</p>
            <div className="space-y-2 max-h-72 overflow-y-auto mb-5 pr-1">
              {recipes.find(r => r.id === recipeId)?.ingredients?.map(ing => (
                <label key={ing.id} className="flex items-center gap-3 text-sm text-zinc-200 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checkedIngredients.has(ing.id)}
                    onChange={() => toggleIngredient(ing.id)}
                    className="rounded accent-green-500 shrink-0"
                  />
                  <span>
                    {ing.quantity != null ? `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''} ` : ''}{ing.name}
                  </span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={confirmIngredients}
                disabled={checkedIngredients.size === 0}
                className="flex-1 bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-30 transition-colors"
              >
                Add {checkedIngredients.size} item{checkedIngredients.size !== 1 ? 's' : ''} to list
              </button>
              <button
                onClick={onSaved}
                className="px-4 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

async function mergeIngredientsToShoppingList(ingredients: RecipeIngredient[]) {
  if (!ingredients.length) return
  const { data: existing } = await supabase.from('shopping_list_items').select('*').eq('is_purchased', false)
  const existingMap = new Map<string, { id: string; quantity: number | null }>()
  for (const item of existing ?? []) {
    existingMap.set(`${item.name.toLowerCase()}|${item.unit ?? ''}`, item)
  }
  for (const ing of ingredients) {
    const key = `${ing.name.toLowerCase()}|${ing.unit ?? ''}`
    const match = existingMap.get(key)
    if (match) {
      await supabase.from('shopping_list_items').update({ quantity: (match.quantity ?? 0) + (ing.quantity ?? 0) }).eq('id', match.id)
    } else {
      await supabase.from('shopping_list_items').insert({ name: ing.name, quantity: ing.quantity, unit: ing.unit, is_purchased: false })
    }
  }
}
