import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useHousehold } from '../contexts/HouseholdContext'
import { getPermissionState, initNotifications, disableNotifications, isSubscribed, isPushSupported } from '../lib/notifications'

interface NotifPrefs {
  notify_shopping: boolean
  notify_todos: boolean
  notify_meals: boolean
  notify_messages: boolean
  todo_reminder_3d: boolean
  todo_reminder_2d: boolean
  todo_reminder_1d: boolean
  todo_reminder_time: string
}

const DEFAULT_PREFS: NotifPrefs = {
  notify_shopping: true,
  notify_todos: true,
  notify_meals: true,
  notify_messages: true,
  todo_reminder_3d: false,
  todo_reminder_2d: false,
  todo_reminder_1d: false,
  todo_reminder_time: '18:00',
}

export default function NotificationsPage() {
  const { household } = useHousehold()
  const [currentUserId, setCurrentUserId] = useState('')
  const [notifPermission, setNotifPermission] = useState<ReturnType<typeof getPermissionState>>('default')
  const [notifSubscribed, setNotifSubscribed] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(DEFAULT_PREFS)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? '')
    })
    setNotifPermission(getPermissionState())
    isSubscribed().then(setNotifSubscribed)
  }, [])

  useEffect(() => {
    if (!currentUserId) return
    supabase.from('notification_preferences')
      .select('*')
      .eq('user_id', currentUserId)
      .maybeSingle()
      .then(({ data }) => { if (data) setNotifPrefs({ ...DEFAULT_PREFS, ...data }) })
  }, [currentUserId])

  async function toggleNotifications() {
    if (!household) return
    setNotifLoading(true)
    if (notifSubscribed) {
      await disableNotifications(currentUserId)
      setNotifSubscribed(false)
      setNotifPermission(getPermissionState())
    } else {
      const ok = await initNotifications(currentUserId, household.id)
      if (ok) setNotifSubscribed(true)
      setNotifPermission(getPermissionState())
    }
    setNotifLoading(false)
  }

  function updateNotifPref<K extends keyof NotifPrefs>(key: K, value: NotifPrefs[K]) {
    const updated = { ...notifPrefs, [key]: value }
    setNotifPrefs(updated)
    if (!currentUserId) return
    supabase.from('notification_preferences')
      .upsert({ user_id: currentUserId, ...updated }, { onConflict: 'user_id' })
      .then(() => {}, () => {})
  }

  if (!household) return null

  return (
    <div className="max-w-sm mx-auto px-4 py-6 flex flex-col gap-6">
      <h2 className="text-xl font-bold text-zinc-100">Notifications</h2>

      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 flex flex-col gap-4">
        {/* Master push toggle */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-zinc-200 font-medium">Push notifications</p>
            <p className="text-xs text-zinc-500 mt-0.5">Get notified when household members take action</p>
          </div>
          {!isPushSupported() ? (
            <span className="text-xs text-zinc-600 flex-shrink-0">Not supported</span>
          ) : (
            <button
              onClick={toggleNotifications}
              disabled={notifLoading || notifPermission === 'denied'}
              className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative disabled:opacity-40 ${
                notifSubscribed ? 'bg-green-500' : 'bg-zinc-700'
              }`}
            >
              {notifLoading ? (
                <span className="absolute inset-0 flex items-center justify-center">
                  <span className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
                </span>
              ) : (
                <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  notifSubscribed ? 'translate-x-7' : 'translate-x-1'
                }`} />
              )}
            </button>
          )}
        </div>

        {notifPermission === 'denied' && (
          <p className="text-xs text-amber-400/80 bg-amber-500/10 rounded-lg px-3 py-2">
            Notifications are blocked. Enable them in your browser or phone settings, then try again.
          </p>
        )}

        {notifSubscribed && (
          <>
            <div className="border-t border-zinc-800" />

            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Notify me about</p>
              {([
                { key: 'notify_shopping',  label: 'Shopping list', icon: '🛒' },
                { key: 'notify_todos',     label: 'Todos',          icon: '✅' },
                { key: 'notify_meals',     label: 'Meal plan',      icon: '📅' },
                { key: 'notify_messages',  label: 'Messages',       icon: '💬' },
              ] as { key: keyof NotifPrefs; label: string; icon: string }[]).map(({ key, label, icon }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-300 flex items-center gap-2">
                    <span className="text-base leading-none">{icon}</span> {label}
                  </span>
                  <button
                    onClick={() => updateNotifPref(key, !notifPrefs[key])}
                    className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${
                      notifPrefs[key] ? 'bg-green-500' : 'bg-zinc-700'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      notifPrefs[key] ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              ))}
            </div>

            <div className="border-t border-zinc-800" />

            <div className="flex flex-col gap-3">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Todo reminders</p>
              <p className="text-[11px] text-zinc-600 -mt-1">Remind me before a todo is due</p>

              {([
                { key: 'todo_reminder_3d', label: '3 days before' },
                { key: 'todo_reminder_2d', label: '2 days before' },
                { key: 'todo_reminder_1d', label: '1 day before' },
              ] as { key: keyof NotifPrefs; label: string }[]).map(({ key, label }) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-sm text-zinc-300">{label}</span>
                  <button
                    onClick={() => updateNotifPref(key, !notifPrefs[key])}
                    className={`flex-shrink-0 w-11 h-6 rounded-full transition-colors relative ${
                      notifPrefs[key] ? 'bg-green-500' : 'bg-zinc-700'
                    }`}
                  >
                    <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      notifPrefs[key] ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              ))}

              {(notifPrefs.todo_reminder_1d || notifPrefs.todo_reminder_2d || notifPrefs.todo_reminder_3d) && (
                <div className="flex items-center gap-3 pt-1">
                  <span className="text-sm text-zinc-400">At</span>
                  <input
                    type="time"
                    value={notifPrefs.todo_reminder_time}
                    onChange={e => setNotifPrefs(prev => ({ ...prev, todo_reminder_time: e.target.value }))}
                    onBlur={e => updateNotifPref('todo_reminder_time', e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-xs text-zinc-600">Zurich</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
