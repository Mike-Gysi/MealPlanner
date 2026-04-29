import { supabase } from './supabase'
import type { Household } from '../types'

export interface HouseholdMembership {
  household: Household
  role: 'admin' | 'member'
}

export async function getUserHouseholds(userId: string): Promise<HouseholdMembership[]> {
  const { data } = await supabase
    .from('household_members')
    .select('role, households(*)')
    .eq('user_id', userId)
    .order('joined_at')
  return (data ?? []).map(row => ({
    household: row.households as unknown as Household,
    role: row.role as 'admin' | 'member',
  }))
}

export async function switchActiveHousehold(householdId: string, userId: string): Promise<void> {
  await supabase.from('profiles').update({ household_id: householdId }).eq('id', userId)
}

function generateJoinKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function createHousehold(
  name: string,
  userId: string,
  username: string,
): Promise<{ error: string | null }> {
  const join_key = generateJoinKey()
  const { data: household, error: hhErr } = await supabase
    .from('households')
    .insert({ name: name.trim(), join_key, created_by: userId })
    .select()
    .single()

  if (hhErr || !household) return { error: hhErr?.message ?? 'Failed to create household' }

  await supabase.from('household_members').insert({
    household_id: household.id,
    user_id: userId,
    username,
    role: 'admin',
  })

  await supabase.from('profiles').update({ household_id: household.id }).eq('id', userId)

  return { error: null }
}

export async function joinHousehold(
  joinKey: string,
  userId: string,
  username: string,
): Promise<{ error: string | null }> {
  const { data: household, error: lookupErr } = await supabase
    .from('households')
    .select('id')
    .eq('join_key', joinKey.trim().toUpperCase())
    .single()

  if (lookupErr) {
    const msg = lookupErr.message ?? ''
    if (msg.includes('relation') || msg.includes('does not exist') || msg.includes('42P01')) {
      return { error: 'Database not set up yet — please run the households migration in the Supabase SQL Editor first.' }
    }
    return { error: 'Invalid invite key — please check and try again.' }
  }
  if (!household) return { error: 'Invalid invite key — please check and try again.' }

  await supabase.from('household_members').upsert(
    { household_id: household.id, user_id: userId, username, role: 'member' },
    { onConflict: 'household_id,user_id' },
  )

  await supabase.from('profiles').update({ household_id: household.id }).eq('id', userId)

  return { error: null }
}

export async function deleteHousehold(householdId: string): Promise<{ error: string | null }> {
  // Clear FK on profiles first (no ON DELETE action set)
  await supabase.from('profiles').update({ household_id: null }).eq('household_id', householdId)

  // Delete all household data in parallel
  await Promise.all([
    supabase.from('calendar_entries').delete().eq('household_id', householdId),
    supabase.from('shopping_list_items').delete().eq('household_id', householdId),
    supabase.from('shopping_list_history').delete().eq('household_id', householdId),
    supabase.from('todos').delete().eq('household_id', householdId),
    supabase.from('activity_log').delete().eq('household_id', householdId),
    supabase.from('recipes').delete().eq('household_id', householdId),
  ])

  // Delete household row — cascades to household_members and push_subscriptions
  const { error } = await supabase.from('households').delete().eq('id', householdId)
  return { error: error?.message ?? null }
}

// ── Export / Import ──────────────────────────────────────────────────────────

export interface HouseholdExport {
  version: 1
  exported_at: string
  household_name: string
  recipes: Array<{
    id: string
    name: string
    ingredients: Array<{ name: string; quantity: number | null; unit: string | null }>
  }>
  calendar_entries: Array<{
    id: string
    date: string
    meal_type: string
    recipe_id: string | null
    custom_text: string | null
    leftover_of: string | null
  }>
  shopping_list: Array<{ name: string; quantity: number | null; unit: string | null }>
  todos: Array<{
    name: string
    due_date: string
    assigned_to: string
    recurring: boolean
    recur_type: string | null
    recur_interval: number | null
    recur_week_position: string | null
    recur_month_day: number | null
  }>
}

export interface ImportSummary {
  recipes: number
  calendarEntries: number
  shoppingItems: number
  todos: number
}

export async function exportHouseholdData(householdId: string, householdName: string): Promise<void> {
  const [
    { data: recipesRaw },
    { data: calendarRaw },
    { data: shoppingRaw },
    { data: todosRaw },
  ] = await Promise.all([
    supabase
      .from('recipes')
      .select('id, name, ingredients:recipe_ingredients(name, quantity, unit)')
      .eq('household_id', householdId)
      .order('name'),
    supabase
      .from('calendar_entries')
      .select('id, date, meal_type, recipe_id, custom_text, leftover_of')
      .eq('household_id', householdId)
      .order('date'),
    supabase
      .from('shopping_list_items')
      .select('name, quantity, unit')
      .eq('household_id', householdId)
      .eq('is_purchased', false)
      .order('created_at'),
    supabase
      .from('todos')
      .select('name, due_date, assigned_to, recurring, recur_type, recur_interval, recur_week_position, recur_month_day')
      .eq('household_id', householdId)
      .eq('completed', false)
      .order('due_date'),
  ])

  const payload: HouseholdExport = {
    version: 1,
    exported_at: new Date().toISOString(),
    household_name: householdName,
    recipes: (recipesRaw ?? []).map(r => ({
      id: r.id,
      name: r.name,
      ingredients: ((r.ingredients ?? []) as Array<{ name: string; quantity: number | null; unit: string | null }>).map(i => ({
        name: i.name,
        quantity: i.quantity,
        unit: i.unit,
      })),
    })),
    calendar_entries: (calendarRaw ?? []).map(e => ({
      id: e.id,
      date: e.date,
      meal_type: e.meal_type,
      recipe_id: e.recipe_id,
      custom_text: e.custom_text,
      leftover_of: e.leftover_of,
    })),
    shopping_list: (shoppingRaw ?? []).map(i => ({ name: i.name, quantity: i.quantity, unit: i.unit })),
    todos: (todosRaw ?? []).map(t => ({
      name: t.name,
      due_date: t.due_date,
      assigned_to: t.assigned_to,
      recurring: t.recurring,
      recur_type: t.recur_type,
      recur_interval: t.recur_interval,
      recur_week_position: t.recur_week_position,
      recur_month_day: t.recur_month_day,
    })),
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `beehive-${householdName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function importHouseholdData(
  householdId: string,
  data: HouseholdExport,
): Promise<{ imported: ImportSummary; error: string | null }> {
  const recipeIdMap = new Map<string, string>()

  for (const recipe of data.recipes) {
    const { data: newRecipe } = await supabase
      .from('recipes')
      .insert({ name: recipe.name, household_id: householdId })
      .select('id')
      .single()
    if (newRecipe) {
      recipeIdMap.set(recipe.id, newRecipe.id)
      if (recipe.ingredients.length) {
        await supabase.from('recipe_ingredients').insert(
          recipe.ingredients.map(ing => ({ ...ing, recipe_id: newRecipe.id })),
        )
      }
    }
  }

  const calendarIdMap = new Map<string, string>()
  const toRelink: Array<{ newId: string; oldLeftoverId: string }> = []

  for (const entry of data.calendar_entries) {
    const { data: newEntry } = await supabase
      .from('calendar_entries')
      .insert({
        date: entry.date,
        meal_type: entry.meal_type,
        recipe_id: entry.recipe_id ? (recipeIdMap.get(entry.recipe_id) ?? null) : null,
        custom_text: entry.custom_text,
        leftover_of: null,
        household_id: householdId,
      })
      .select('id')
      .single()
    if (newEntry) {
      calendarIdMap.set(entry.id, newEntry.id)
      if (entry.leftover_of) toRelink.push({ newId: newEntry.id, oldLeftoverId: entry.leftover_of })
    }
  }

  for (const { newId, oldLeftoverId } of toRelink) {
    const mappedId = calendarIdMap.get(oldLeftoverId)
    if (mappedId) await supabase.from('calendar_entries').update({ leftover_of: mappedId }).eq('id', newId)
  }

  if (data.shopping_list.length) {
    await supabase.from('shopping_list_items').insert(
      data.shopping_list.map(item => ({ ...item, is_purchased: false, household_id: householdId })),
    )
  }

  if (data.todos.length) {
    await supabase.from('todos').insert(
      data.todos.map(todo => ({ ...todo, completed: false, household_id: householdId })),
    )
  }

  return {
    imported: {
      recipes: recipeIdMap.size,
      calendarEntries: calendarIdMap.size,
      shoppingItems: data.shopping_list.length,
      todos: data.todos.length,
    },
    error: null,
  }
}

export async function setMemberRole(
  householdId: string,
  userId: string,
  role: 'admin' | 'member',
): Promise<void> {
  await supabase
    .from('household_members')
    .update({ role })
    .eq('household_id', householdId)
    .eq('user_id', userId)
}
