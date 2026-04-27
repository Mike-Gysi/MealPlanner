import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Settings() {
  const [username, setUsername] = useState('')
  const [initial, setInitial] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

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
    setError('')
    const { data: userData, error } = await supabase.auth.updateUser({
      data: { username: username.trim() },
    })
    if (!error && userData.user) {
      await supabase.from('profiles').upsert({ id: userData.user.id, username: username.trim() }, { onConflict: 'id' })
    }
    if (error) {
      setError(error.message)
    } else {
      setInitial(username.trim())
      setMessage('Username updated!')
      setTimeout(() => setMessage(''), 3000)
    }
    setSaving(false)
  }

  const changed = username.trim() !== initial && username.trim() !== ''

  return (
    <div className="max-w-sm mx-auto px-4 py-6">
      <h2 className="text-xl font-bold text-zinc-100 mb-6">Settings</h2>

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
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
          />
        </div>

        {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
        {message && <p className="text-green-400 text-sm bg-green-400/10 rounded-lg px-3 py-2">{message}</p>}

        <button
          onClick={saveUsername}
          disabled={saving || !changed}
          className="bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-30 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className="mt-4">
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-500/30 rounded-xl py-2.5 text-sm transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
