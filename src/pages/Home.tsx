import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { format, isToday, isYesterday, parseISO, formatDistanceToNow } from 'date-fns'
import { supabase } from '../lib/supabase'
import { fetchRecentActivity, type ActivityItem } from '../lib/activity'

const nav = [
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/shopping', label: 'Shopping', icon: '🛒' },
  { to: '/todos', label: 'Todos', icon: '✅' },
  { to: '/recipes', label: 'Recipes', icon: '🍽️' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

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

export default function Home() {
  const [username, setUsername] = useState('')
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [beeDone, setBeeDone] = useState(false)
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set())
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUsername(data.user?.user_metadata?.username ?? '')
    })
    fetchRecentActivity().then(items => {
      setActivity(items)
      setLoadingActivity(false)
      // open today and yesterday by default
      const keys = new Set(
        items
          .map(i => format(new Date(i.timestamp), 'yyyy-MM-dd'))
          .filter(k => {
            const d = parseISO(k)
            return isToday(d) || isYesterday(d)
          })
      )
      setOpenGroups(keys)
    })
    const channel = supabase.channel('activity-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_log' }, () => {
        fetchRecentActivity().then(items => {
          setActivity(items)
          setOpenGroups(prev => {
            const next = new Set(prev)
            for (const item of items) {
              const key = format(new Date(item.timestamp), 'yyyy-MM-dd')
              const d = parseISO(key)
              if (isToday(d) || isYesterday(d)) next.add(key)
            }
            return next
          })
        })
      })
      .subscribe()
    // Re-fetch after a short delay to catch activity logged just before navigating here
    const refetch = setTimeout(() => {
      fetchRecentActivity().then(items => {
        setActivity(prev => items.length > prev.length ? items : prev)
      })
    }, 1500)
    const t = setTimeout(() => setBeeDone(true), 2000)
    return () => { clearTimeout(t); clearTimeout(refetch); supabase.removeChannel(channel) }
  }, [])

  function toggleGroup(key: string) {
    setOpenGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const groups = groupActivity(activity)

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
      {/* Title */}
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
            Hello <span className="text-zinc-200 font-semibold">{username}</span>, welcome back
          </p>
        )}
      </div>

      {/* Nav grid */}
      <div className="grid grid-cols-3 gap-4 w-full max-w-xs">
        {nav.map(({ to, label, icon }) => (
          <button
            key={to}
            onClick={() => navigate(to)}
            className="aspect-square flex flex-col items-center justify-center gap-2 bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 rounded-2xl transition-colors border border-zinc-700"
          >
            <span className="text-3xl leading-none">{icon}</span>
            <span className="text-xs text-zinc-300 font-medium">{label}</span>
          </button>
        ))}
      </div>

      {/* Recent activity */}
      <div className="w-full max-w-xs">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">Recent Activity</h2>
          <div className="flex items-center gap-2">
            {activity.length === 0 && !loadingActivity && (
              <button
                onClick={() => { setLoadingActivity(true); fetchRecentActivity().then(items => { setActivity(items); setLoadingActivity(false) }) }}
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
