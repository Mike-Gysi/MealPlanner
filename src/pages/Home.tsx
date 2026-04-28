import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../lib/supabase'
import { fetchRecentActivity, type ActivityItem } from '../lib/activity'

const nav = [
  { to: '/calendar', label: 'Calendar', icon: '📅' },
  { to: '/shopping', label: 'Shopping', icon: '🛒' },
  { to: '/todos', label: 'Todos', icon: '✅' },
  { to: '/recipes', label: 'Recipes', icon: '🍽️' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
]

export default function Home() {
  const [username, setUsername] = useState('')
  const [activity, setActivity] = useState<ActivityItem[]>([])
  const [loadingActivity, setLoadingActivity] = useState(true)
  const [beeDone, setBeeDone] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUsername(data.user?.user_metadata?.username ?? '')
    })
    fetchRecentActivity().then(items => {
      setActivity(items)
      setLoadingActivity(false)
    })
    const t = setTimeout(() => setBeeDone(true), 2000)
    return () => clearTimeout(t)
  }, [])

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
            {activity.map(item => (
              <div key={item.id} className="flex items-start gap-3 bg-zinc-800/60 rounded-xl px-3 py-2.5 border border-zinc-700/50">
                <span className="text-base leading-none mt-0.5 flex-shrink-0">{item.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-zinc-300">
                    <span className="font-semibold text-green-400">{item.username}</span>
                    {' '}{item.action}
                  </p>
                  <p className="text-xs text-zinc-500 truncate">{item.entityName}</p>
                </div>
                <span className="text-[10px] text-zinc-600 flex-shrink-0 mt-0.5">
                  {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    </>
  )
}
