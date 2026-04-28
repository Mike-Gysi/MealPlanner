import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function parseItem(text: string): { name: string; quantity: number | null; unit: string | null } {
  const match = text.match(/^([\d.,]+)\s*([a-zA-Z]+)\s+(.+)$/)
  if (match) return { quantity: parseFloat(match[1].replace(',', '.')), unit: match[2], name: match[3] }
  return { name: text, quantity: null, unit: null }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Verify anon key from header or query param
  const apikey =
    req.headers.get('apikey') ??
    new URL(req.url).searchParams.get('apikey')

  if (!apikey || apikey !== Deno.env.get('SUPABASE_ANON_KEY')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  let body: { name?: string; quantity?: number; unit?: string }
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const raw = body.name?.trim()
  if (!raw) {
    return new Response(JSON.stringify({ error: 'name is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const parsed = parseItem(raw)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { error } = await supabase
    .from('shopping_list_items')
    .insert({ name: parsed.name, quantity: parsed.quantity, unit: parsed.unit, is_purchased: false })

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const label = parsed.quantity
    ? `${parsed.quantity}${parsed.unit ? ' ' + parsed.unit : ''} ${parsed.name}`
    : parsed.name

  return new Response(
    JSON.stringify({ success: true, message: `Added ${label} to the shopping list` }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  )
})
