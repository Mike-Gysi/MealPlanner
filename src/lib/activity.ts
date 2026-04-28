import { supabase } from './supabase'

export interface ActivityItem {
  id: string
  icon: string
  username: string
  action: string
  entityName: string
  timestamp: string
}

const ICONS: Record<string, string> = {
  todo: '✅',
  shopping: '🛒',
  recipe: '🍽️',
  calendar: '📅',
}

export function logActivity(action: string, entityType: string, entityName: string): void {
  supabase.auth.getSession().then(({ data: { session } }) => {
    if (!session) return
    const username = session.user.user_metadata?.username ?? 'Someone'
    supabase.from('activity_log')
      .insert({ user_id: session.user.id, username, action, entity_type: entityType, entity_name: entityName })
  })
}

export async function fetchRecentActivity(): Promise<ActivityItem[]> {
  const { data } = await supabase
    .from('activity_log')
    .select('id, username, action, entity_type, entity_name, created_at')
    .order('created_at', { ascending: false })
    .limit(40)

  return (data ?? []).map(row => ({
    id: row.id,
    icon: ICONS[row.entity_type] ?? '•',
    username: row.username,
    action: row.action,
    entityName: row.entity_name,
    timestamp: row.created_at,
  }))
}
