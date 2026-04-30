import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CHANGELOG } from '../lib/changelog'
import { format, parseISO } from 'date-fns'

export default function Settings() {
  const [username, setUsername] = useState('')
  const [initial, setInitial] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [acctError, setAcctError] = useState('')
  const [showChangelog, setShowChangelog] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      const name = u?.user_metadata?.username ?? ''
      setUsername(name)
      setInitial(name)
      setEmail(u?.email ?? '')
    })
  }, [])

  async function saveUsername() {
    if (!username.trim() || username.trim() === initial) return
    setSaving(true)
    setMessage('')
    setAcctError('')
    const { data: userData, error } = await supabase.auth.updateUser({ data: { username: username.trim() } })
    if (!error && userData.user) {
      await supabase.from('profiles').upsert({ id: userData.user.id, username: username.trim() }, { onConflict: 'id' })
    }
    if (error) {
      setAcctError(error.message)
    } else {
      setInitial(username.trim())
      setMessage('Username updated!')
      setTimeout(() => setMessage(''), 3000)
    }
    setSaving(false)
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
          {message && <p className="text-green-400 text-sm bg-green-400/10 rounded-lg px-3 py-2">{message}</p>}
          <button
            onClick={saveUsername}
            disabled={saving || !changed}
            className="bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-30 transition-colors"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

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
