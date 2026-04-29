import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { createHousehold, joinHousehold } from '../lib/household'
import { useHousehold } from '../contexts/HouseholdContext'

export default function HouseholdSetup() {
  const { refresh } = useHousehold()
  const [tab, setTab] = useState<'create' | 'join'>('create')
  const [householdName, setHouseholdName] = useState('')
  const [joinKey, setJoinKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function getSession() {
    const { data: { session } } = await supabase.auth.getSession()
    return session
  }

  async function handleCreate() {
    if (!householdName.trim()) return
    setLoading(true)
    setError('')
    const session = await getSession()
    if (!session) { setError('Not authenticated'); setLoading(false); return }
    const username = session.user.user_metadata?.username ?? 'Unknown'
    const { error: err } = await createHousehold(householdName.trim(), session.user.id, username)
    if (err) { setError(err); setLoading(false); return }
    await refresh()
  }

  async function handleJoin() {
    if (!joinKey.trim()) return
    setLoading(true)
    setError('')
    const session = await getSession()
    if (!session) { setError('Not authenticated'); setLoading(false); return }
    const username = session.user.user_metadata?.username ?? 'Unknown'
    const { error: err } = await joinHousehold(joinKey.trim(), session.user.id, username)
    if (err) { setError(err); setLoading(false); return }
    await refresh()
  }

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-green-400 tracking-tight mb-1">🐝 The Bee Hive</h1>
          <p className="text-zinc-400 text-sm mt-2">Set up your household to get started.</p>
        </div>

        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-6">
          <div className="flex bg-zinc-800 rounded-xl p-1 mb-5">
            {(['create', 'join'] as const).map(t => (
              <button
                key={t}
                onClick={() => { setTab(t); setError('') }}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${tab === t ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {t === 'create' ? 'Create' : 'Join'}
              </button>
            ))}
          </div>

          {tab === 'create' ? (
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Household Name</label>
                <input
                  type="text"
                  value={householdName}
                  onChange={e => setHouseholdName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="e.g. The Smith Family"
                  className={inputClass}
                />
              </div>
              {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
              <button
                onClick={handleCreate}
                disabled={loading || !householdName.trim()}
                className="bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-40 transition-colors"
              >
                {loading ? 'Creating…' : 'Create Household'}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5 uppercase tracking-wide">Invite Key</label>
                <input
                  type="text"
                  value={joinKey}
                  onChange={e => setJoinKey(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && handleJoin()}
                  placeholder="INVITATION-KEY"
                  className={`${inputClass} uppercase tracking-widest font-mono`}
                  maxLength={8}
                />
              </div>
              {error && <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{error}</p>}
              <button
                onClick={handleJoin}
                disabled={loading || !joinKey.trim()}
                className="bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-40 transition-colors"
              >
                {loading ? 'Joining…' : 'Join Household'}
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => supabase.auth.signOut()}
          className="mt-4 w-full text-center text-sm text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
