import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { CHANGELOG } from '../lib/changelog'
import { fetchLeaderboard, type Period, type UserScore, type LeaderboardData } from '../lib/leaderboard'
import { createHousehold, joinHousehold, setMemberRole, deleteHousehold } from '../lib/household'
import { useHousehold } from '../contexts/HouseholdContext'
import { format, parseISO } from 'date-fns'
import type { HouseholdMember } from '../types'
import { getPermissionState, initNotifications, disableNotifications, isSubscribed, isPushSupported } from '../lib/notifications'

// ── Leaderboard helpers ───────────────────────────────────────────────────────

function ScoreRow({ score, rank, aheadOf, behindBy, isLeader }: {
  score: UserScore; rank: number; aheadOf: number | null; behindBy: number | null; isLeader: boolean
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
        {aheadOf !== null && aheadOf > 0 && <span className="text-xs text-green-600/70 tabular-nums">+{aheadOf}</span>}
        {behindBy !== null && behindBy > 0 && <span className="text-xs text-zinc-600 tabular-nums">−{behindBy}</span>}
      </div>
    </div>
  )
}

function LeaderCategory({ label, award, scores, emptyLabel }: {
  label: string; award: string; scores: UserScore[]; emptyLabel: string
}) {
  const leader = scores[0]
  const second = scores[1]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-zinc-300">{label}</span>
        {scores.length > 0 && <span className="text-xs text-yellow-500/80 font-medium">{award}</span>}
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

// ── Main component ────────────────────────────────────────────────────────────

export default function Settings() {
  const { household, members, isAdmin, allHouseholds, refresh, switchHousehold } = useHousehold()

  // Account
  const [username, setUsername] = useState('')
  const [initial, setInitial] = useState('')
  const [email, setEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [acctError, setAcctError] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')

  // Household management
  const [copied, setCopied] = useState(false)
  const [showCreateHH, setShowCreateHH] = useState(false)
  const [showJoinHH, setShowJoinHH] = useState(false)
  const [hhName, setHhName] = useState('')
  const [hhKey, setHhKey] = useState('')
  const [hhError, setHhError] = useState('')
  const [hhLoading, setHhLoading] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Leaderboard
  const [period, setPeriod] = useState<Period>('week')
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [loadingLB, setLoadingLB] = useState(true)

  // Changelog
  const [showChangelog, setShowChangelog] = useState(false)

  // Notifications
  const [notifPermission, setNotifPermission] = useState<ReturnType<typeof getPermissionState>>('default')
  const [notifSubscribed, setNotifSubscribed] = useState(false)
  const [notifLoading, setNotifLoading] = useState(false)

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
    if (!household) return
    setLoadingLB(true)
    fetchLeaderboard(period, household.id).then(data => {
      setLeaderboard(data)
      setLoadingLB(false)
    })
  }, [period, household?.id])

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

  async function copyKey() {
    if (!household) return
    await navigator.clipboard.writeText(household.join_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleCreateHH() {
    if (!hhName.trim()) return
    setHhLoading(true)
    setHhError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setHhError('Not authenticated'); setHhLoading(false); return }
    const uname = session.user.user_metadata?.username ?? 'Unknown'
    const { error: err } = await createHousehold(hhName.trim(), session.user.id, uname)
    if (err) { setHhError(err); setHhLoading(false); return }
    setHhName('')
    setShowCreateHH(false)
    await refresh()
    setHhLoading(false)
  }

  async function handleJoinHH() {
    if (!hhKey.trim()) return
    setHhLoading(true)
    setHhError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setHhError('Not authenticated'); setHhLoading(false); return }
    const uname = session.user.user_metadata?.username ?? 'Unknown'
    const { error: err } = await joinHousehold(hhKey.trim(), session.user.id, uname)
    if (err) { setHhError(err); setHhLoading(false); return }
    setHhKey('')
    setShowJoinHH(false)
    await refresh()
    setHhLoading(false)
  }

  async function handleDeleteHousehold() {
    if (!household) return
    setDeleting(true)
    setDeleteError('')
    const { error } = await deleteHousehold(household.id)
    if (error) {
      setDeleteError(error)
      setDeleting(false)
      return
    }
    const others = allHouseholds.filter(m => m.household.id !== household.id)
    if (others.length > 0) {
      await switchHousehold(others[0].household.id)
    } else {
      await refresh()
    }
    setShowDeleteModal(false)
    setDeleting(false)
  }

  async function handleSwitch(id: string) {
    setSwitching(id)
    await switchHousehold(id)
    setSwitching(null)
  }

  async function toggleRole(member: HouseholdMember) {
    if (!household) return
    const newRole = member.role === 'admin' ? 'member' : 'admin'
    await setMemberRole(household.id, member.user_id, newRole)
    await refresh()
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

  const changed = username.trim() !== initial && username.trim() !== ''
  const doerAward = period === 'week' ? 'Doer of the Week' : period === 'month' ? 'Doer of the Month' : 'Doer of the Year'
  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"

  return (
    <div className="max-w-sm mx-auto px-4 py-6 flex flex-col gap-6">
      <h2 className="text-xl font-bold text-zinc-100">Settings</h2>

      {/* ── Account ─────────────────────────────────────────────────────── */}
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

      {/* ── Household ───────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">Household</h3>

        {/* Household switcher — shown when user belongs to any household */}
        {allHouseholds.length > 0 && (
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-3 flex flex-col gap-1.5">
            {allHouseholds.map(({ household: hh, role }) => {
              const isActive = hh.id === household?.id
              return (
                <div
                  key={hh.id}
                  className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
                    isActive ? 'bg-green-500/10 border border-green-500/20' : 'bg-zinc-800'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />}
                    <span className={`text-sm font-medium truncate ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`}>
                      {hh.name}
                    </span>
                    <span className="text-[10px] text-zinc-600 flex-shrink-0 capitalize">{role}</span>
                  </div>
                  {isActive ? (
                    <span className="text-[10px] text-green-500 font-semibold flex-shrink-0">Active</span>
                  ) : (
                    <button
                      onClick={() => handleSwitch(hh.id)}
                      disabled={switching === hh.id}
                      className="flex-shrink-0 text-xs text-green-400 border border-green-500/30 rounded-lg px-2.5 py-1 hover:bg-green-500/10 transition-colors disabled:opacity-40"
                    >
                      {switching === hh.id ? '…' : 'Switch'}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Active household details */}
        {household && (
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 flex flex-col gap-4">
            {/* Invite key */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">Invite Key</label>
              <div className="flex gap-2">
                <p className="flex-1 text-sm font-mono font-semibold text-green-400 bg-zinc-800 rounded-xl px-3 py-2.5 tracking-widest">{household.join_key}</p>
                <button
                  onClick={copyKey}
                  className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-[10px] text-zinc-600 mt-1.5 px-1">Share this key with others so they can join your household.</p>
            </div>

            {/* Members */}
            <div>
              <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
                Members ({members.length})
              </label>
              <div className="flex flex-col gap-1.5">
                {members.map(member => (
                  <div key={member.id} className="flex items-center justify-between bg-zinc-800 rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {member.role === 'admin' && <span className="text-sm leading-none">👑</span>}
                      <span className={`text-sm truncate ${member.user_id === currentUserId ? 'text-zinc-100 font-semibold' : member.role === 'admin' ? 'text-zinc-200' : 'text-zinc-400'}`}>
                        {member.username}
                        {member.user_id === currentUserId && <span className="text-zinc-600 font-normal"> (you)</span>}
                      </span>
                    </div>
                    {isAdmin && member.user_id !== currentUserId && (
                      <button
                        onClick={() => toggleRole(member)}
                        className="text-[11px] text-zinc-600 hover:text-zinc-300 flex-shrink-0 ml-2 transition-colors"
                      >
                        {member.role === 'admin' ? 'Remove admin' : 'Make admin'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {isAdmin && (
              <>
                <div className="border-t border-zinc-800" />
                <button
                  onClick={() => { setShowDeleteModal(true); setDeleteError('') }}
                  className="w-full text-sm text-red-400/70 hover:text-red-400 transition-colors text-left"
                >
                  Delete this household…
                </button>
              </>
            )}
          </div>
        )}

        {/* Create / Join controls */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => { setShowCreateHH(v => !v); setShowJoinHH(false); setHhError('') }}
            className="w-full border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 rounded-xl py-2.5 text-sm transition-colors"
          >
            {showCreateHH ? 'Cancel' : household ? 'Create new household' : 'Create a household'}
          </button>

          {showCreateHH && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
              <input
                value={hhName}
                onChange={e => setHhName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreateHH()}
                placeholder="Household name"
                className={inputClass}
              />
              {hhError && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{hhError}</p>}
              <button
                onClick={handleCreateHH}
                disabled={hhLoading || !hhName.trim()}
                className="bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-30 transition-colors"
              >
                {hhLoading ? 'Creating…' : 'Create'}
              </button>
            </div>
          )}

          <button
            onClick={() => { setShowJoinHH(v => !v); setShowCreateHH(false); setHhError('') }}
            className="w-full border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 rounded-xl py-2.5 text-sm transition-colors"
          >
            {showJoinHH ? 'Cancel' : 'Join another household'}
          </button>

          {showJoinHH && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
              <input
                value={hhKey}
                onChange={e => setHhKey(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && handleJoinHH()}
                placeholder="INVITATION-KEY"
                className={`${inputClass} uppercase tracking-widest font-mono`}
                maxLength={8}
              />
              {hhError && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{hhError}</p>}
              <button
                onClick={handleJoinHH}
                disabled={hhLoading || !hhKey.trim()}
                className="bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-30 transition-colors"
              >
                {hhLoading ? 'Joining…' : 'Join'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Notifications ───────────────────────────────────────────────── */}
      {household && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider px-1">Notifications</h3>
          <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 flex flex-col gap-3">
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
          </div>
        </div>
      )}

      {/* ── Leaderboard ─────────────────────────────────────────────────── */}
      {household && (
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
      )}

      {/* ── Actions ─────────────────────────────────────────────────────── */}
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

      {showDeleteModal && household && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="bg-zinc-900 border border-red-500/30 w-full max-w-sm rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-3">
              <span className="text-xl leading-none">⚠️</span>
              <h3 className="font-semibold text-red-400">Delete "{household.name}"?</h3>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <p className="text-sm text-zinc-300 leading-relaxed">
                This will permanently delete the household and <span className="text-zinc-100 font-medium">all of its data</span> for every member:
              </p>
              <ul className="flex flex-col gap-1.5">
                {['All recipes', 'The entire meal plan', 'Shopping list & history', 'All todos', 'Activity log'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-zinc-400">
                    <span className="w-1 h-1 rounded-full bg-red-500/60 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-zinc-500">This cannot be undone.</p>
              {deleteError && (
                <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{deleteError}</p>
              )}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="flex-1 border border-zinc-700 rounded-xl py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteHousehold}
                  disabled={deleting}
                  className="flex-1 bg-red-500 hover:bg-red-400 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-40 transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Delete everything'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
