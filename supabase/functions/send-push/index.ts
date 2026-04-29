import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT')!,
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const supabaseUser = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error: authError } = await supabaseUser.auth.getUser()
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { householdId, actorUserId, title, body, notifType } = await req.json()

  const { data: rawSubs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .eq('household_id', householdId)
    .neq('user_id', actorUserId)

  if (!rawSubs?.length) {
    return new Response('no subscribers', { headers: corsHeaders })
  }

  // Filter recipients by their notification type preference
  let subscriptions = rawSubs
  if (notifType) {
    const { data: prefs } = await supabaseAdmin
      .from('notification_preferences')
      .select('user_id, notify_shopping, notify_todos, notify_meals')
      .in('user_id', rawSubs.map(s => s.user_id))

    const prefsMap = new Map(prefs?.map(p => [p.user_id, p]) ?? [])

    subscriptions = rawSubs.filter(sub => {
      const p = prefsMap.get(sub.user_id)
      if (!p) return true // no row = all enabled (default)
      if (notifType === 'shopping') return p.notify_shopping
      if (notifType === 'todos') return p.notify_todos
      if (notifType === 'meals') return p.notify_meals
      return true
    })
  }

  if (!subscriptions.length) {
    return new Response('no subscribers', { headers: corsHeaders })
  }

  const payload = JSON.stringify({ title, body, url: '/' })

  await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      ).catch((err: Error) => {
        if ((err as { statusCode?: number }).statusCode === 410) {
          supabaseAdmin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
        }
      })
    ),
  )

  return new Response('ok', { headers: corsHeaders })
})
