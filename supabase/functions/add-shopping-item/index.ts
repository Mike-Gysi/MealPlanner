import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function parseItem(text: string): { name: string; quantity: number | null; unit: string | null } {
  const match = text.match(/^([\d.,]+)\s*([a-zA-Z]+)\s+(.+)$/)
  if (match) return { quantity: parseFloat(match[1].replace(',', '.')), unit: match[2], name: match[3] }
  return { name: text, quantity: null, unit: null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let item: string, key: string
  try {
    const body = await req.json()
    item = (body.item ?? '').trim()
    key = (body.key ?? '').trim()
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  if (!item) return json({ error: 'item is required' }, 400)
  if (!key) return json({ error: 'key is required' }, 400)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: household } = await supabase
    .from('households')
    .select('id')
    .eq('api_key', key)
    .single()

  if (!household) return json({ error: 'Invalid API key' }, 401)

  const parsed = parseItem(item)

  const { error } = await supabase.from('shopping_list_items').insert({
    name: parsed.name,
    quantity: parsed.quantity,
    unit: parsed.unit,
    is_purchased: false,
    household_id: household.id,
  })

  if (error) return json({ error: error.message }, 500)

  await supabase.from('activity_log').insert({
    username: 'Siri',
    action: 'added to shopping list',
    entity_type: 'shopping',
    entity_name: parsed.name,
    household_id: household.id,
  })

  const label = parsed.quantity
    ? `${parsed.quantity}${parsed.unit ? ' ' + parsed.unit : ''} ${parsed.name}`
    : parsed.name

  return json({ success: true, message: `Added ${label} to the shopping list` })
})
