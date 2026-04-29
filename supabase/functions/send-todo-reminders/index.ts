import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function utcDatePlus(base: Date, days: number): string {
  const d = new Date(base)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok')
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 })

  const now = new Date()
  const currentHour = now.getUTCHours()

  const date1d = utcDatePlus(now, 1)
  const date2d = utcDatePlus(now, 2)
  const date3d = utcDatePlus(now, 3)

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id, household_id')

  if (!subs?.length) return new Response('ok')

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('user_id, todo_reminder_1d, todo_reminder_2d, todo_reminder_3d, todo_reminder_time')
    .in('user_id', subs.map(s => s.user_id))

  if (!prefs?.length) return new Response('ok')

  // Only process users whose reminder time matches the current UTC hour
  // and who have at least one reminder interval enabled
  const matchingPrefs = prefs.filter(p => {
    if (!p.todo_reminder_1d && !p.todo_reminder_2d && !p.todo_reminder_3d) return false
    const [h] = p.todo_reminder_time.split(':').map(Number)
    return h === currentHour
  })

  if (!matchingPrefs.length) return new Response('ok')

  const matchingUserIds = matchingPrefs.map(p => p.user_id)

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, username')
    .in('id', matchingUserIds)

  const profileMap = new Map(profiles?.map(p => [p.id, p.username]) ?? [])
  const subsMap = new Map(subs.map(s => [s.user_id, s]))

  const sends: Promise<unknown>[] = []

  for (const pref of matchingPrefs) {
    const sub = subsMap.get(pref.user_id)
    if (!sub) continue

    const username = profileMap.get(pref.user_id)

    const dueDates: { date: string; label: string }[] = []
    if (pref.todo_reminder_1d) dueDates.push({ date: date1d, label: 'tomorrow' })
    if (pref.todo_reminder_2d) dueDates.push({ date: date2d, label: 'in 2 days' })
    if (pref.todo_reminder_3d) dueDates.push({ date: date3d, label: 'in 3 days' })

    const { data: todos } = await supabase
      .from('todos')
      .select('name, due_date, assigned_to')
      .eq('household_id', sub.household_id)
      .eq('completed', false)
      .in('due_date', dueDates.map(d => d.date))

    const myTodos = (todos ?? []).filter(t =>
      t.assigned_to === 'all' || (username && t.assigned_to === username)
    )

    for (const todo of myTodos) {
      const entry = dueDates.find(d => d.date === todo.due_date)
      if (!entry) continue

      sends.push(
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({
            title: 'Upcoming Todo',
            body: `"${todo.name}" is due ${entry.label}`,
            url: '/',
          }),
        ).catch((err: { statusCode?: number }) => {
          if (err.statusCode === 410) {
            supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        })
      )
    }
  }

  await Promise.allSettled(sends)
  return new Response('ok')
})
