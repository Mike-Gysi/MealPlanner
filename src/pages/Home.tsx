import { useEffect, useState } from 'react'
import { format, isToday, isYesterday, parseISO, formatDistanceToNow, differenceInCalendarDays } from 'date-fns'
import { supabase } from '../lib/supabase'
import { fetchRecentActivity, type ActivityItem } from '../lib/activity'
import { fetchLeaderboard, type LeaderboardData } from '../lib/leaderboard'
import { useHousehold } from '../contexts/HouseholdContext'

interface ActivityGroup {
  key: string
  label: string
  items: ActivityItem[]
}

function groupActivity(items: ActivityItem[]): ActivityGroup[] {
  const map = new Map<string, ActivityItem[]>()
  for (const item of items) {
    const key = format(new Date(item.timestamp), 'yyyy-MM-dd')
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, groupItems]) => {
      const date = parseISO(key)
      const label = isToday(date) ? 'Today' : isYesterday(date) ? 'Yesterday' : format(date, 'd MMM yyyy')
      return { key, label, items: groupItems }
    })
}

interface UpcomingTodo {
  id: string
  name: string
  due_date: string
}

function todoUrgency(dueDate: string): 'overdue' | 'soon' | 'normal' {
  const days = differenceInCalendarDays(parseISO(dueDate), new Date())
  if (days < 0) return 'overdue'
  if (days <= 2) return 'soon'
  return 'normal'
}

function UpcomingTodos({ todos }: { todos: UpcomingTodo[] }) {
  const [open, setOpen] = useState(true)

  if (todos.length === 0) return null

  return (
    <div className="w-full max-w-xs">
      <div className="rounded-xl border border-zinc-700/50 overflow-hidden">
        <button
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 transition-colors"
        >
          <span className="text-xs font-semibold text-zinc-300">Upcoming Todos</span>
          <span className="flex items-center gap-1.5">
            <span className="text-[10px] text-zinc-600">{todos.length}</span>
            <span className={`text-zinc-500 text-xs transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>›</span>
          </span>
        </button>
        {open && (
          <div className="flex flex-col divide-y divide-zinc-700/40">
            {todos.map(todo => {
              const urgency = todoUrgency(todo.due_date)
              const nameColor = urgency === 'overdue' ? 'text-red-400' : urgency === 'soon' ? 'text-orange-400' : 'text-zinc-200'
              const dateColor = urgency === 'overdue' ? 'text-red-500/60' : urgency === 'soon' ? 'text-orange-500/60' : 'text-zinc-600'
              const days = differenceInCalendarDays(parseISO(todo.due_date), new Date())
              const dateLabel = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days < 0 ? `${Math.abs(days)}d overdue` : format(parseISO(todo.due_date), 'd MMM')
              return (
                <div key={todo.id} className="flex items-center justify-between bg-zinc-800/40 px-3 py-2.5 gap-3">
                  <span className={`text-xs flex-1 min-w-0 truncate ${nameColor}`}>{todo.name}</span>
                  <span className={`text-[10px] flex-shrink-0 tabular-nums whitespace-nowrap ${dateColor}`}>{dateLabel}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function WeeklyLeaderboard({ data }: { data: LeaderboardData }) {
  const categories = [
    { key: 'todos' as const, icon: '✅', label: 'Todos', award: 'Doer of the Week' },
    { key: 'shopping' as const, icon: '🛒', label: 'Shopping', award: 'Shopping Queen' },
  ]

  return (
    <div className="w-full max-w-xs">
      <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-3">This Week</h2>
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-4 grid grid-cols-2 gap-x-4 gap-y-0">
        {categories.map(({ key, icon, label, award }) => {
          const scores = data[key]
          const leader = scores[0]
          return (
            <div key={key}>
              <div className="flex items-center gap-1 mb-2">
                <span className="text-xs">{icon}</span>
                <span className="text-xs font-semibold text-zinc-400">{label}</span>
              </div>
              {scores.length === 0 ? (
                <p className="text-[10px] text-zinc-600">No activity yet</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {scores.slice(0, 3).map((s, i) => {
                    const diff = i === 0 ? null : leader.count - s.count
                    return (
                      <div key={s.username} className="flex items-center gap-1 min-w-0">
                        <span className="text-xs w-4 flex-shrink-0 text-center leading-none">
                          {i === 0 ? '👑' : <span className="text-[10px] text-zinc-600">{i + 1}</span>}
                        </span>
                        <span className={`text-xs truncate flex-1 ${i === 0 ? 'text-zinc-100 font-semibold' : 'text-zinc-500'}`}>
                          {s.username}
                        </span>
                        <span className={`text-xs font-bold tabular-nums flex-shrink-0 ${i === 0 ? 'text-green-400' : 'text-zinc-600'}`}>
                          {s.count}
                        </span>
                        {diff !== null && diff > 0 && (
                          <span className="text-[10px] text-zinc-700 tabular-nums flex-shrink-0">−{diff}</span>
                        )}
                      </div>
                    )
                  })}
                  {scores.length > 0 && (
                    <p className="text-[10px] text-yellow-600/60 mt-0.5 truncate">{award}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Home() {
  const [username, setUsername] = useState('')
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [beeDone, setBeeDone] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const { household } = useHousehold()
  const householdId = household?.id ?? ''
  const [weeklyLB, setWeeklyLB] = useState<LeaderboardData | null>(null)
  const [upcomingTodos, setUpcomingTodos] = useState<UpcomingTodo[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUsername(data.user?.user_metadata?.username ?? '')
    })
  }, [])

  useEffect(() => {
    if (!householdId) return
    fetchRecentActivity(householdId).then(items => {
      setActivity(items)
      setLoadingActivity(false)
      const keys = new Set(
        items
          .map(i => format(new Date(i.timestamp), 'yyyy-MM-dd'))
          .filter(k => isToday(parseISO(k)))
      )
      setOpenGroups(keys)
    })
    fetchLeaderboard('week', householdId).then(setWeeklyLB)
    supabase.from('todos').select('id, name, due_date').eq('household_id', householdId).eq('completed', false).order('due_date', { ascending: true }).limit(4).then(({ data }) => setUpcomingTodos(data ?? []))
    const channel = supabase.channel('activity-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => {
        fetchRecentActivity(householdId).then(items => {
          setActivity(items)
          setOpenGroups(prev => {
            const next = new Set(prev)
            for (const item of items) {
              const key = format(new Date(item.timestamp), 'yyyy-MM-dd')
              if (isToday(parseISO(key))) next.add(key)
            }
            return next
          })
        })
        fetchLeaderboard('week', householdId).then(setWeeklyLB)
      })
      .subscribe()
    const refetch = setTimeout(() => {
      fetchRecentActivity(householdId).then(items => {
        setActivity(prev => items.length > prev.length ? items : prev)
      })
    }, 1500)
    const t = setTimeout(() => setBeeDone(true), 2000)
    return () => { clearTimeout(t); clearTimeout(refetch); supabase.removeChannel(channel) }
  }, [householdId])

  function toggleGroup(key: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const groups = groupActivity(activity)

  const personalNotices: { icon: string; text: string }[] = []
  if (weeklyLB && username) {
    const { todos, shopping } = weeklyLB
    if (todos.length > 0 && todos[0].username !== username) {
      const leader = todos[0]
      const mine = todos.find(s => s.username === username)?.count ?? 0
      const diff = leader.count - mine
      personalNotices.push({
        icon: '🏆',
        text: `${leader.username} is the current Doer of the Week — you are ${diff} todo${diff === 1 ? '' : 's'} behind`,
      })
    }
    if (shopping.length > 0 && shopping[0].username !== username) {
      const leader = shopping[0]
      const mine = shopping.find(s => s.username === username)?.count ?? 0
      const diff = leader.count - mine
      personalNotices.push({
        icon: '👸',
        text: `${leader.username} is the current Shopping Queen — you are ${diff} item${diff === 1 ? '' : 's'} behind`,
      })
    }
  }

  return (
    <>
    <style>{`
      @keyframes bee-fly-in {
        0%   { transform: translate(140px, -60px) rotate(-25deg) scale(2); opacity: 0; }
        10%  { opacity: 1; }
        35%  { transform: translate(80px, 70px) rotate(18deg) scale(1.7); }
        60%  { transform: translate(20px, 100px) rotate(-10deg) scale(1.4); }
        80%  { transform: translate(-15px, 30px) rotate(6deg) scale(1.2); }
        100% { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 1; }
      }
    `}</style>
    <div className="flex flex-col items-center px-6 py-10 gap-10 pb-24">
      {/* Hero title with bee animation */}
      <div className="text-center">
        <h1 className="text-5xl font-extrabold text-green-400 tracking-tight">
          <span className="relative inline-block">
            <span style={{ opacity: beeDone ? 1 : 0 }}>🐝</span>
            {!beeDone && (
              <span
                className="absolute top-0 left-0 pointer-events-none"
                style={{ animation: 'bee-fly-in 2s cubic-bezier(0.4, 0, 0.2, 1) forwards' }}
              >🐝</span>
            )}
          </span>
          {' '}The Bee Hive
        </h1>
        {username && (
          <p className="text-zinc-400 mt-3 text-base">
            Hello <span className="text-zinc-200 font-semibold">{username}</span>, welcome to the Bee Hive
          </p>
        )}
      </div>

      {/* Personal leaderboard notices */}
      {personalNotices.length > 0 && (
        <div className="w-full max-w-xs flex flex-col gap-2">
          {personalNotices.map((n, i) => (
            <div key={i} className="flex items-start gap-2.5 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5">
              <span className="text-base flex-shrink-0">{n.icon}</span>
              <p className="text-xs text-zinc-400 leading-snug">{n.text}</p>
            </div>
          ))}
        </div>
      )}

      {/* Upcoming todos */}
      <UpcomingTodos todos={upcomingTodos} />

      {/* Weekly leaderboard */}
      {weeklyLB && <WeeklyLeaderboard data={weeklyLB} />}

      {/* Recent activity */}
      <div className="w-full max-w-xs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Recent Activity</h2>
          <div className="flex items-center gap-2">
            {activity.length === 0 && !loadingActivity && (
              <button
                onClick={() => { setLoadingActivity(true); fetchRecentActivity(householdId).then(items => { setActivity(items); setLoadingActivity(false) }) }}
                className="text-xs text-green-500 hover:text-green-400 transition-colors"
              >
                Recover
              </button>
            )}
            {activity.length > 0 && (
              <button
                onClick={() => setActivity([])}
                className="text-zinc-600 hover:text-zinc-400 text-lg leading-none transition-colors"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {loadingActivity ? (
          <div className="flex justify-center py-6">
            <div className="w-5 h-5 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activity.length === 0 ? (
          <p className="text-center text-zinc-600 text-sm py-6">No activity yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {groups.map(group => {
              const open = openGroups.has(group.key)
              return (
                <div key={group.key} className="rounded-xl border border-zinc-700/50 overflow-hidden">
                  {/* Group header */}
                  <button
                    onClick={() => toggleGroup(group.key)}
                    className="w-full flex items-center justify-between px-3 py-2 bg-zinc-800 hover:bg-zinc-750 transition-colors"
                  >
                    <span className="text-xs font-semibold text-zinc-300">{group.label}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-[10px] text-zinc-600">{group.items.length}</span>
                      <span className={`text-zinc-500 text-xs transition-transform duration-200 ${open ? 'rotate-90' : ''}`}>›</span>
                    </span>
                  </button>

                  {/* Group items */}
                  {open && (
                    <div className="flex flex-col divide-y divide-zinc-700/40">
                      {group.items.map(item => (
                        <div key={item.id} className="flex items-start gap-3 bg-zinc-800/40 px-3 py-2.5">
                          <span className="text-base leading-none mt-0.5 flex-shrink-0">{item.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-zinc-300">
                              <span className="font-semibold text-green-400">{item.username}</span>
                              {' '}{item.action}
                            </p>
                            <p className="text-xs text-zinc-500 truncate">{item.entityName}</p>
                          </div>
                          <span className="text-[10px] text-zinc-600 flex-shrink-0 mt-0.5 whitespace-nowrap">
                            {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
