import { supabase } from './supabase'
import { notifyHousehold } from './notifications'

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

const NOTIFY_ACTIONS: Record<string, (username: string, entityName: string) => { title: string; body: string }> = {
  'added to shopping list': (u, n) => ({ title: 'Shopping List', body: `${u} added: ${n}` }),
  'purchased': (u, n) => ({ title: 'Shopping List', body: `${u} bought: ${n}` }),
  'added todo': (u, n) => ({ title: 'New Todo', body: `${u} added: ${n}` }),
  'completed todo': (u, n) => ({ title: 'Todo Done', body: `${u} completed: ${n}` }),
  'planned meal': (u, n) => ({ title: 'Meal Plan', body: `${u} planned: ${n}` }),
  'updated meal plan': (u, n) => ({ title: 'Meal Plan', body: `${u} updated: ${n}` }),
}

const NOTIFY_TYPES: Record<string, 'shopping' | 'todos' | 'meals'> = {
  'added to shopping list': 'shopping',
  'purchased': 'shopping',
  'added todo': 'todos',
  'completed todo': 'todos',
  'planned meal': 'meals',
  'updated meal plan': 'meals',
}

export function logActivity(
  action: string,
  entityType: string,
  entityName: string,
  householdId: string,
): void {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    if (!session) return
    const username = session.user.user_metadata?.username ?? 'Someone'
    await supabase.from('activity_log').insert({
      user_id: session.user.id,
      username,
      action,
      entity_type: entityType,
      entity_name: entityName,
      household_id: householdId,
    })

    const builder = NOTIFY_ACTIONS[action]
    if (builder) {
      const { title, body } = builder(username, entityName)
      notifyHousehold(householdId, session.user.id, title, body, NOTIFY_TYPES[action])
    }
  })
}

export async function fetchRecentActivity(householdId: string): Promise<ActivityItem[]> {
  const { data } = await supabase
    .from('activity_log')
    .select('id, username, action, entity_type, entity_name, created_at')
    .eq('household_id', householdId)
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
