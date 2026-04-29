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
