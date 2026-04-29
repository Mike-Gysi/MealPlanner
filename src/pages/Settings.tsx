import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CHANGELOG } from '../lib/changelog'
import { fetchLeaderboard, type Period, type UserScore, type LeaderboardData } from '../lib/leaderboard'
import { format, parseISO } from 'date-fns'

function ScoreRow({ score, rank, aheadOf, behindBy, isLeader }: {
  score: UserScore
  rank: number
  aheadOf: number | null
  behindBy: number | null
  isLeader: boolean
}) {
  return (
    <div className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${isLeader ? 'bg-green-500/10 border border-green-500/20' : 'bg-zinc-800/50'}`}>
      <div className="flex items-center gap-2.5">
        <span className="w-5 text-center flex-shrink-0">
          {rank === 1
            ? <span className="text-base leading-none">👑</span>
            : <span className="text-xs font-bold text-zinc-600">{rank}</span>}
        </span>
        <span className={`text-sm ${isLeader ? 'text-zinc-100 font-semibold' : 'text-zinc-400'}`}>{score.username}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className={`text-sm font-bold tabular-nums ${isLeader ? 'text-green-400' : 'text-zinc-400'}`}>{score.count}</span>
        {aheadOf !== null && aheadOf > 0 && (
          <span className="text-xs text-green-600/70 tabular-nums">+{aheadOf}</span>
        )}
        {behindBy !== null && behindBy > 0 && (
          <span className="text-xs text-zinc-600 tabular-nums">−{behindBy}</span>
        )}
      </div>
    </div>
  )
}

function LeaderCategory({ label, award, scores, emptyLabel }: {
  label: string
  award: string
  scores: UserScore[]
  emptyLabel: string
}) {
  const leader = scores[0]
  const second = scores[1]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-300">{label}</span>
        {scores.length > 0 && (
          <span className="text-xs text-yellow-500/80 font-medium">{award}</span>
        )}
      </div>
      {scores.length === 0 ? (
        <p className="text-xs text-zinc-600 px-1">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {scores.map((s, i) => (
            <ScoreRow
              key={s.username}
              score={s}
              rank={i + 1}
              aheadOf={i === 0 && second ? leader.count - second.count : null}
              behindBy={i > 0 ? leader.count - s.count : null}
              isLeader={i === 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function Settings() {
  const [username, setUsername] = useState('')
  const [initial, setInitial] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [showChangelog, setShowChangelog] = useState(false)
  const [period, setPeriod] = useState<Period>('week')
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [loadingLB, setLoadingLB] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      const name = u?.user_metadata?.username ?? ''
      setUsername(name)
      setInitial(name)
      setEmail(u?.email ?? '')
    })
  }, [])

  useEffect(() => {
    setLoadingLB(true)
    fetchLeaderboard(period).then(data => {
      setLeaderboard(data)
      setLoadingLB(false)
    })
  }, [period])

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
  const doerAward = period === 'week' ? 'Doer of the Week' : period === 'month' ? 'Doer of the Month' : 'Doer of the Year'

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
      </div>

      {/* Leaderboard */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">Leaderboard</h3>
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 flex flex-col gap-5">
          <div className="flex bg-zinc-800 rounded-xl p-1 gap-1">
            {(['week', 'month', 'year'] as Period[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${period === p ? 'bg-zinc-700 text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {p}
              </button>
            ))}
          </div>

          {loadingLB ? (
            <p className="text-xs text-zinc-600 text-center py-4">Loading…</p>
          ) : (
            <>
              <LeaderCategory
                label="Todos"
                award={doerAward}
                scores={leaderboard?.todos ?? []}
                emptyLabel={`No todos completed this ${period} yet`}
              />
              <div className="border-t border-zinc-800" />
              <LeaderCategory
                label="Shopping"
                award="Shopping Queen"
                scores={leaderboard?.shopping ?? []}
                emptyLabel={`No items purchased this ${period} yet`}
              />
            </>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => setShowChangelog(true)}
          className="w-full border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 rounded-xl py-2.5 text-sm transition-colors"
        >
          Changelog
        </button>
        <button
          onClick={() => supabase.auth.signOut()}
          className="w-full border border-zinc-800 text-zinc-500 hover:text-red-400 hover:border-red-500/30 rounded-xl py-2.5 text-sm transition-colors"
        >
          Sign out
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
