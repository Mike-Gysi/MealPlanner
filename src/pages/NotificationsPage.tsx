import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format, isToday, isYesterday, parseISO } from 'date-fns'

interface Notif {
  id: string
  sender_username: string
  body: string
  read: boolean
  created_at: string
  todo_id?: string | null
}

function SwipeableNotif({
  notif,
  onNavigate,
  onDelete,
  formatDate,
}: {
  notif: Notif
  onNavigate: () => void
  onDelete: () => void
  formatDate: (s: string) => string
}) {
  const [offsetX, setOffsetX] = useState(0)
  const startXRef = useRef(0)
  const movedRef = useRef(false)
  const THRESHOLD = 72

  function onTouchStart(e: React.TouchEvent) {
    startXRef.current = e.touches[0].clientX
    movedRef.current = false
  }

  function onTouchMove(e: React.TouchEvent) {
    const delta = e.touches[0].clientX - startXRef.current
    if (delta < -4) {
      movedRef.current = true
      setOffsetX(Math.max(delta, -(THRESHOLD + 24)))
    }
  }

  function onTouchEnd() {
    if (offsetX <= -THRESHOLD) {
      onDelete()
    }
    setOffsetX(0)
  }

  function handleClick() {
    if (movedRef.current) return
    if (notif.todo_id) onNavigate()
  }

  const progress = Math.min(1, Math.abs(offsetX) / THRESHOLD)

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* Red backdrop revealed on swipe */}
      <div
        className="absolute inset-0 rounded-xl flex items-center justify-end pr-4"
        style={{ backgroundColor: `rgba(239,68,68,${0.08 + progress * 0.28})` }}
      >
        <span className="text-red-400 text-xs font-semibold">Delete</span>
      </div>

      {/* Notification content */}
      <div
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: offsetX === 0 ? 'transform 0.2s ease' : 'none',
          touchAction: 'pan-y',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleClick}
        className={`relative bg-zinc-900 rounded-xl border px-4 py-3 flex flex-col gap-1 select-none ${
          notif.todo_id ? 'cursor-pointer active:bg-zinc-800' : ''
        } ${notif.read ? 'border-zinc-800' : 'border-green-500/30'}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            {!notif.read && (
              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0 mt-1" />
            )}
            <p className="text-sm text-zinc-200 leading-snug">{notif.body}</p>
          </div>
          <span className="text-[10px] text-zinc-600 flex-shrink-0 mt-0.5">{formatDate(notif.created_at)}</span>
        </div>
        <p className="text-xs text-zinc-500 pl-4">from {notif.sender_username}</p>
        {notif.todo_id && (
          <p className="text-xs text-green-500 font-medium pl-4">→ Open todo</p>
        )}
      </div>
    </div>
  )
}

export default function NotificationsPage() {
  const navigate = useNavigate()
  const [notifs, setNotifs] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState('')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? '')
    })
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    fetchNotifs()
    const channel = supabase.channel('notifs-inbox')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `recipient_id=eq.${currentUserId}`,
      }, fetchNotifs)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [currentUserId])

  async function fetchNotifs() {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('recipient_id', currentUserId)
      .order('created_at', { ascending: false })
    setNotifs(data ?? [])
    setLoading(false)
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('recipient_id', currentUserId)
      .eq('read', false)
  }

  async function deleteNotif(id: string) {
    setNotifs(prev => prev.filter(n => n.id !== id))
    await supabase.from('messages').delete().eq('id', id)
  }

  function formatDate(str: string) {
    const d = parseISO(str)
    if (isToday(d)) return format(d, 'HH:mm')
    if (isYesterday(d)) return 'Yesterday'
    return format(d, 'd MMM yyyy')
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-6 flex flex-col gap-4">
      <h2 className="text-xl font-bold text-zinc-100">Notifications</h2>

      {loading ? (
        <div className="flex justify-center py-10">
          <div className="w-6 h-6 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : notifs.length === 0 ? (
        <p className="text-center text-zinc-600 text-sm py-10">No notifications yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {notifs.map(n => (
            <SwipeableNotif
              key={n.id}
              notif={n}
              onNavigate={() => navigate(`/todos?edit=${n.todo_id}`)}
              onDelete={() => deleteNotif(n.id)}
              formatDate={formatDate}
            />
          ))}
        </div>
      )}
    </div>
  )
}
