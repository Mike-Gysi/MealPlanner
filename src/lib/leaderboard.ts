import { supabase } from './supabase'
import { startOfWeek, startOfMonth, startOfYear } from 'date-fns'

export type Period = 'week' | 'month' | 'year'

export interface UserScore {
  username: string
  count: number
}

export interface LeaderboardData {
  todos: UserScore[]
  shopping: UserScore[]
}

export async function fetchLeaderboard(period: Period, householdId: string): Promise<LeaderboardData> {
  const now = new Date()
  let start: Date
  if (period === 'week') start = startOfWeek(now, { weekStartsOn: 1 })
  else if (period === 'month') start = startOfMonth(now)
  else start = startOfYear(now)

  const { data } = await supabase
    .from('activity_log')
    .select('username, action')
    .eq('household_id', householdId)
    .gte('created_at', start.toISOString())

  const todoCount: Record<string, number> = {}
  const shoppingCount: Record<string, number> = {}

  for (const row of data ?? []) {
    if (row.action === 'completed todo') {
      todoCount[row.username] = (todoCount[row.username] ?? 0) + 1
    }
    if (row.action === 'purchased') {
      shoppingCount[row.username] = (shoppingCount[row.username] ?? 0) + 1
    }
  }

  const toScores = (counts: Record<string, number>) =>
    Object.entries(counts)
      .map(([username, count]) => ({ username, count }))
      .sort((a, b) => b.count - a.count)

  return { todos: toScores(todoCount), shopping: toScores(shoppingCount) }
}
