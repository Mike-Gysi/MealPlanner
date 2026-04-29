import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { logActivity } from '../lib/activity'
import { useHousehold } from '../contexts/HouseholdContext'
import type { Todo, Profile } from '../types'
import {
  format, isPast, isToday, parseISO,
  addDays, addWeeks, addMonths,
  startOfWeek, setDate,
} from 'date-fns'

function nextDueDate(todo: Todo): string {
  const from = parseISO(todo.due_date)
  const interval = todo.recur_interval ?? 1

  if (todo.recur_type === 'daily') {
    return format(addDays(from, interval), 'yyyy-MM-dd')
  }

  if (todo.recur_type === 'weekly') {
    const base = addWeeks(from, interval)
    const monday = startOfWeek(base, { weekStartsOn: 1 })
    const pos = todo.recur_week_position
    const day = pos === 'start' ? monday : pos === 'middle' ? addDays(monday, 2) : addDays(monday, 4)
    return format(day, 'yyyy-MM-dd')
  }

  if (todo.recur_type === 'monthly') {
    const next = addMonths(from, interval)
    return format(setDate(next, todo.recur_month_day ?? 1), 'yyyy-MM-dd')
  }

  return todo.due_date
}

export default function Todos() {
  const { household } = useHousehold()
  const householdId = household?.id ?? ''

  const [todos, setTodos] = useState<Todo[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'open' | 'done'>('open')
  const [filterUser, setFilterUser] = useState<string>('all')

  useEffect(() => {
    if (!householdId) return
    fetchAll()
    const channel = supabase.channel('todos-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, fetchAll)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [householdId])

  async function fetchAll() {
    setLoading(true)
    const [{ data: todosData }, { data: profilesData }] = await Promise.all([
      supabase.from('todos').select('*').eq('household_id', householdId).order('due_date'),
      supabase.from('profiles').select('*').eq('household_id', householdId),
    ])
    setTodos(todosData ?? [])
    setProfiles(profilesData ?? [])
    setLoading(false)
  }

  async function toggleComplete(todo: Todo) {
    await supabase.from('todos').update({ completed: !todo.completed }).eq('id', todo.id)
    logActivity(!todo.completed ? 'completed todo' : 'reopened todo', 'todo', todo.name, householdId)
    if (!todo.completed && todo.recurring) {
      const { name, assigned_to, recurring, recur_type, recur_interval, recur_week_position, recur_month_day } = todo
      await supabase.from('todos').insert({
        name, assigned_to, recurring, recur_type, recur_interval, recur_week_position, recur_month_day,
        due_date: nextDueDate(todo),
        completed: false,
        household_id: householdId,
      })
    }
    await fetchAll()
  }

  async function deleteTodo(id: string) {
    const todo = todos.find(t => t.id === id)
    await supabase.from('todos').delete().eq('id', id)
    setTodos(prev => prev.filter(t => t.id !== id))
    if (todo) logActivity('deleted todo', 'todo', todo.name, householdId)
  }

  const byUser = (list: Todo[]) => filterUser === 'all'
    ? list
    : list.filter(t => t.assigned_to === filterUser || t.assigned_to === 'all')
  const open = byUser(todos.filter(t => !t.completed))
  const done = byUser(todos.filter(t => t.completed))
  const displayed = tab === 'open' ? open : done

  return (
    <div className="max-w-lg mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-zinc-100">Todos</h2>
        <button
          onClick={() => setShowForm(true)}
          className="bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl px-3 py-2 text-sm font-bold transition-colors"
        >
          + Add
        </button>
      </div>

      {(showForm || editingTodo) && (
        <TodoForm
          profiles={profiles}
          todo={editingTodo ?? undefined}
          householdId={householdId}
          onSave={async () => { await fetchAll(); setShowForm(false); setEditingTodo(null) }}
          onCancel={() => { setShowForm(false); setEditingTodo(null) }}
        />
      )}

      {/* User filter */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
        {['all', ...profiles.map(p => p.username)].map(u => (
          <button
            key={u}
            onClick={() => setFilterUser(u)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterUser === u ? 'bg-green-500 text-zinc-950' : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {u === 'all' ? 'Everyone' : u}
          </button>
        ))}
      </div>

      <div className="flex gap-1 bg-zinc-800 rounded-xl p-1 mb-4">
        {(['open', 'done'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg capitalize transition-colors ${
              tab === t ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t === 'open' ? `Open (${open.length})` : `Done (${done.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : displayed.length === 0 ? (
        <p className="text-center text-zinc-600 py-10 text-sm">
          {tab === 'open' ? 'No open todos.' : 'Nothing done yet.'}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {displayed.map(todo => (
            <TodoItem key={todo.id} todo={todo} onToggle={toggleComplete} onDelete={deleteTodo} onEdit={setEditingTodo} />
          ))}
        </div>
      )}
    </div>
  )
}

function recurLabel(todo: Todo): string {
  if (!todo.recurring || !todo.recur_type) return ''
  const n = todo.recur_interval ?? 1
  if (todo.recur_type === 'daily') return n === 1 ? 'Every day' : `Every ${n} days`
  if (todo.recur_type === 'weekly') {
    const pos = todo.recur_week_position === 'start' ? 'start' : todo.recur_week_position === 'middle' ? 'mid' : 'end'
    return n === 1 ? `Weekly (${pos})` : `Every ${n} weeks (${pos})`
  }
  if (todo.recur_type === 'monthly') {
    const day = todo.recur_month_day ?? 1
    const suffix = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'
    return n === 1 ? `Monthly (${day}${suffix})` : `Every ${n} months (${day}${suffix})`
  }
  return ''
}

function TodoItem({ todo, onToggle, onDelete, onEdit }: { todo: Todo; onToggle: (t: Todo) => void; onDelete: (id: string) => void; onEdit: (t: Todo) => void }) {
  const due = parseISO(todo.due_date)
  const overdue = !todo.completed && isPast(due) && !isToday(due)
  const dueToday = !todo.completed && isToday(due)
  const label = recurLabel(todo)

  return (
    <div className={`bg-zinc-900 rounded-xl border px-4 py-3 flex items-start gap-3 ${
      overdue ? 'border-red-500/40' : 'border-zinc-800'
    }`}>
      <button
        onClick={() => onToggle(todo)}
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 transition-all ${
          todo.completed ? 'bg-green-500 border-green-500' : overdue ? 'border-red-400 hover:bg-red-400/20' : 'border-zinc-600 hover:border-green-500'
        }`}
      />
      <button onClick={() => onEdit(todo)} className="flex-1 min-w-0 text-left">
        <p className={`text-sm font-medium ${todo.completed ? 'line-through text-zinc-600' : 'text-zinc-100'}`}>
          {todo.name}
        </p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-xs ${overdue ? 'text-red-400 font-semibold' : dueToday ? 'text-amber-400 font-semibold' : 'text-zinc-500'}`}>
            {overdue ? '⚠ ' : dueToday ? '⏰ ' : ''}{format(due, 'd MMM yyyy')}
          </span>
          <span className="text-xs text-zinc-700">·</span>
          <span className="text-xs text-zinc-500">{todo.assigned_to === 'all' ? 'Everyone' : todo.assigned_to}</span>
          {label && (
            <>
              <span className="text-xs text-zinc-700">·</span>
              <span className="text-xs text-green-600">↻ {label}</span>
            </>
          )}
        </div>
      </button>
      <button onClick={() => onDelete(todo.id)} className="text-zinc-700 hover:text-red-400 text-lg leading-none transition-colors flex-shrink-0">×</button>
    </div>
  )
}

interface TodoFormProps {
  profiles: Profile[]
  todo?: Todo
  householdId: string
  onSave: () => void
  onCancel: () => void
}

function TodoForm({ profiles, todo, householdId, onSave, onCancel }: TodoFormProps) {
  const [name, setName] = useState(todo?.name ?? '')
  const [dueDate, setDueDate] = useState(todo?.due_date ?? '')
  const [assignedTo, setAssignedTo] = useState(todo?.assigned_to ?? 'all')
  const [recurring, setRecurring] = useState(todo?.recurring ?? false)
  const [recurType, setRecurType] = useState<'daily' | 'weekly' | 'monthly'>((todo?.recur_type as 'daily' | 'weekly' | 'monthly') ?? 'weekly')
  const [recurInterval, setRecurInterval] = useState(todo?.recur_interval ?? 1)
  const [weekPosition, setWeekPosition] = useState<'start' | 'middle' | 'end'>((todo?.recur_week_position as 'start' | 'middle' | 'end') ?? 'end')
  const [monthDay, setMonthDay] = useState(todo?.recur_month_day ?? 1)
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim() || !dueDate) return
    setSaving(true)
    const payload = {
      name: name.trim(),
      due_date: dueDate,
      assigned_to: assignedTo,
      recurring,
      recur_type: recurring ? recurType : null,
      recur_interval: recurring ? (isNaN(recurInterval) || recurInterval < 1 ? 1 : recurInterval) : null,
      recur_week_position: recurring && recurType === 'weekly' ? weekPosition : null,
      recur_month_day: recurring && recurType === 'monthly' ? monthDay : null,
    }
    if (todo) {
      await supabase.from('todos').update(payload).eq('id', todo.id)
      logActivity('updated todo', 'todo', payload.name, householdId)
    } else {
      await supabase.from('todos').insert({ ...payload, completed: false, household_id: householdId })
      logActivity('added todo', 'todo', payload.name, householdId)
    }
    setSaving(false)
    onSave()
  }

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 mb-4 flex flex-col gap-3">
      <h3 className="font-semibold text-zinc-100">{todo ? 'Edit Todo' : 'New Todo'}</h3>

      <input value={name} onChange={e => setName(e.target.value)} placeholder="What needs to be done?" className={inputClass} />

      <div>
        <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Due date</label>
        <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} className={inputClass} />
      </div>

      <div>
        <label className="block text-xs text-zinc-500 uppercase tracking-wide mb-1.5">Assigned to</label>
        <select value={assignedTo} onChange={e => setAssignedTo(e.target.value)} className={inputClass}>
          <option value="all">Everyone</option>
          {profiles.map(p => <option key={p.id} value={p.username}>{p.username}</option>)}
        </select>
      </div>

      {/* Recurring toggle */}
      <label className="flex items-center gap-3 cursor-pointer">
        <div
          onClick={() => setRecurring(r => !r)}
          className={`w-10 h-6 rounded-full transition-colors relative ${recurring ? 'bg-green-500' : 'bg-zinc-700'}`}
        >
          <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${recurring ? 'translate-x-5' : 'translate-x-1'}`} />
        </div>
        <span className="text-sm text-zinc-300">Recurring</span>
      </label>

      {recurring && (
        <div className="flex flex-col gap-3 pl-2 border-l-2 border-zinc-700">
          {/* Type */}
          <div className="flex gap-1 bg-zinc-800 rounded-xl p-1">
            {(['daily', 'weekly', 'monthly'] as const).map(t => (
              <button
                key={t}
                onClick={() => setRecurType(t)}
                className={`flex-1 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${
                  recurType === t ? 'bg-zinc-600 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Interval */}
          <div className="flex items-center gap-3">
            <label className="text-xs text-zinc-500 w-20">
              Every
            </label>
            <input
              type="number"
              min={1}
              max={52}
              value={isNaN(recurInterval) ? '' : recurInterval}
              onChange={e => setRecurInterval(parseInt(e.target.value))}
              onBlur={() => { if (isNaN(recurInterval) || recurInterval < 1) setRecurInterval(1) }}
              className="w-16 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <span className="text-xs text-zinc-500">
              {recurType === 'daily' ? 'day(s)' : recurType === 'weekly' ? 'week(s)' : 'month(s)'}
            </span>
          </div>

          {/* Weekly: position in week */}
          {recurType === 'weekly' && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Due at</label>
              <div className="flex gap-1 bg-zinc-800 rounded-xl p-1">
                {([['start', 'Start (Mon)'], ['middle', 'Mid (Wed)'], ['end', 'End (Fri)']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setWeekPosition(val)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      weekPosition === val ? 'bg-zinc-600 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Monthly: day of month */}
          {recurType === 'monthly' && (
            <div>
              <label className="block text-xs text-zinc-500 mb-1.5">Day of month</label>
              <select
                value={monthDay}
                onChange={e => setMonthDay(parseInt(e.target.value))}
                className={inputClass}
              >
                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
                  const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'
                  return <option key={d} value={d}>{d}{suffix}</option>
                })}
              </select>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2 mt-1">
        <button
          onClick={save}
          disabled={saving || !name.trim() || !dueDate}
          className="flex-1 bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-30 transition-colors"
        >
          {saving ? 'Saving…' : todo ? 'Update' : 'Save'}
        </button>
        <button onClick={onCancel} className="flex-1 border border-zinc-700 rounded-xl py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
