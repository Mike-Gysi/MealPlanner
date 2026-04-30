import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CHANGELOG } from '../lib/changelog'
import { format, parseISO } from 'date-fns'
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

function Toggle({ on, disabled, loading, onToggle }: { on: boolean; disabled?: boolean; loading?: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      disabled={disabled || loading}
      className={`flex-shrink-0 w-12 h-6 rounded-full transition-colors relative disabled:opacity-40 ${on ? 'bg-green-500' : 'bg-zinc-700'}`}
    >
      {loading ? (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="w-3 h-3 border-2 border-zinc-400 border-t-transparent rounded-full animate-spin" />
        </span>
      ) : (
        <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${on ? 'translate-x-7' : 'translate-x-1'}`} />
      )}
    </button>
  )
}

export default function Settings() {
  const { household } = useHousehold()

  // Account
  const [username, setUsername] = useState('')
  const [initial, setInitial] = useState('')
  const [email, setEmail] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [acctError, setAcctError] = useState('')

  // Push notifications
  const [notifPermission, setNotifPermission] = useState<ReturnType<typeof getPermissionState>>('default')
  const [notifSubscribed, setNotifSubscribed] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(DEFAULT_PREFS)

  // Changelog
  const [showChangelog, setShowChangelog] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      const name = u?.user_metadata?.username ?? ''
      setUsername(name)
      setInitial(name)
      setEmail(u?.email ?? '')
      setCurrentUserId(u?.id ?? '')
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

  async function saveUsername() {
    if (!username.trim() || username.trim() === initial) return
    setSaving(true)
    setSaveMsg('')
    setAcctError('')
    const { data: userData, error } = await supabase.auth.updateUser({ data: { username: username.trim() } })
    if (!error && userData.user) {
      await supabase.from('profiles').upsert({ id: userData.user.id, username: username.trim() }, { onConflict: 'id' })
    }
    if (error) {
      setAcctError(error.message)
    } else {
      setInitial(username.trim())
      setSaveMsg('Username updated!')
      setTimeout(() => setSaveMsg(''), 3000)
    }
    setSaving(false)
  }

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

  const changed = username.trim() !== initial && username.trim() !== ''
  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"

  return (
    <div className="max-w-sm mx-auto px-4 py-6 flex flex-col gap-6">
      <h2 className="text-xl font-bold text-zinc-100">Settings</h2>

      {/* Account */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">Account</h3>
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">Email</label>
            <p className="text-sm text-zinc-400 bg-zinc-800 rounded-xl px-3 py-2.5">{email}</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveUsername()}
              placeholder="Enter a username"
              className={inputClass}
            />
          </div>
          {acctError && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{acctError}</p>}
          {saveMsg && <p className="text-green-400 text-sm bg-green-400/10 rounded-lg px-3 py-2">{saveMsg}</p>}
          <button
            onClick={saveUsername}
            disabled={saving || !changed}
            className="bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-30 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {/* Push notifications */}
      {household && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">Push Notifications</h3>
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-zinc-200 font-medium">Push notifications</p>
                <p className="text-xs text-zinc-500 mt-0.5">Get notified about household activity</p>
              </div>
              {!isPushSupported() ? (
                <span className="text-xs text-zinc-600 flex-shrink-0">Not supported</span>
              ) : (
                <Toggle
                  on={notifSubscribed}
                  disabled={notifPermission === 'denied'}
                  loading={notifLoading}
                  onToggle={toggleNotifications}
                />
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
                    { key: 'notify_shopping', label: 'Shopping list', icon: '🛒' },
                    { key: 'notify_todos',     label: 'Todos',         icon: '✅' },
                    { key: 'notify_meals',     label: 'Meal plan',     icon: '📅' },
                    { key: 'notify_messages',  label: 'Mentions',      icon: '🔔' },
                  ] as { key: keyof NotifPrefs; label: string; icon: string }[]).map(({ key, label, icon }) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm text-zinc-300 flex items-center gap-2">
                        <span className="text-base leading-none">{icon}</span> {label}
                      </span>
                      <Toggle
                        on={!!notifPrefs[key]}
                        onToggle={() => updateNotifPref(key, !notifPrefs[key])}
                      />
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
                      <Toggle
                        on={!!notifPrefs[key]}
                        onToggle={() => updateNotifPref(key, !notifPrefs[key])}
                      />
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
      )}

      {/* Changelog */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setShowChangelog(true)}
          className="w-full border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 rounded-xl py-2.5 text-sm transition-colors"
        >
          Changelog
        </button>
      </div>

      {showChangelog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => setShowChangelog(false)}>
          <div className="bg-zinc-900 border border-zinc-700 w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 flex-shrink-0">
              <h3 className="font-semibold text-zinc-100">Changelog</h3>
              <button onClick={() => setShowChangelog(false)} className="text-zinc-600 hover:text-zinc-300 text-2xl leading-none transition-colors">×</button>
            </div>
            <div className="overflow-y-auto p-5 flex flex-col gap-3">
              {CHANGELOG.map(entry => (
                <div key={entry.hash} className="flex gap-3">
                  <div className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5" />
                    <div className="w-px flex-1 bg-zinc-800" />
                  </div>
                  <div className="pb-3">
                    <p className="text-sm text-zinc-200 leading-snug">{entry.message}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-zinc-600">{format(parseISO(entry.date), 'd MMM yyyy')}</span>
                      <span className="text-xs text-zinc-700">·</span>
                      <span className="font-mono text-xs text-zinc-700">{entry.hash}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
