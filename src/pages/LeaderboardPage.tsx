import { useEffect, useState } from 'react'
import { fetchLeaderboard, type Period, type UserScore, type LeaderboardData } from '../lib/leaderboard'
import { useHousehold } from '../contexts/HouseholdContext'

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

export default function LeaderboardPage() {
  const { household } = useHousehold()
  const [period, setPeriod] = useState<Period>('week')
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!household) return
    setLoading(true)
    fetchLeaderboard(period, household.id).then(data => {
      setLeaderboard(data)
      setLoading(false)
    })
  }, [period, household?.id])

  const doerAward = period === 'week' ? 'Doer of the Week' : period === 'month' ? 'Doer of the Month' : 'Doer of the Year'

  return (
    <div className="max-w-sm mx-auto px-4 py-6 flex flex-col gap-6">
      <h2 className="text-xl font-bold text-zinc-100">Leaderboard</h2>
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
        {loading ? (
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
  )
}
