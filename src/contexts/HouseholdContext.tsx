import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { getUserHouseholds, switchActiveHousehold, type HouseholdMembership } from '../lib/household'
import type { Household, HouseholdMember } from '../types'

interface HouseholdContextValue {
  household: Household | null
  members: HouseholdMember[]
  isAdmin: boolean
  loading: boolean
  allHouseholds: HouseholdMembership[]
  refresh: () => Promise<void>
  switchHousehold: (id: string) => Promise<void>
}

const HouseholdContext = createContext<HouseholdContextValue>({
  household: null,
  members: [],
  isAdmin: false,
  loading: true,
  allHouseholds: [],
  refresh: async () => {},
  switchHousehold: async () => {},
})

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const [household, setHousehold] = useState<Household | null>(null)
  const [members, setMembers] = useState<HouseholdMember[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [allHouseholds, setAllHouseholds] = useState<HouseholdMembership[]>([])

  async function refresh() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setHousehold(null); setMembers([]); setIsAdmin(false); setAllHouseholds([]); setLoading(false); return }

    const [{ data: profile }, memberships] = await Promise.all([
      supabase.from('profiles').select('household_id').eq('id', session.user.id).single(),
      getUserHouseholds(session.user.id),
    ])

    setAllHouseholds(memberships)

    if (!profile?.household_id) {
      setHousehold(null); setMembers([]); setIsAdmin(false); setLoading(false); return
    }

    const [{ data: hh }, { data: mems }] = await Promise.all([
      supabase.from('households').select('*').eq('id', profile.household_id).single(),
      supabase.from('household_members').select('*').eq('household_id', profile.household_id).order('joined_at'),
    ])

    setHousehold(hh ?? null)
    const memberList = mems ?? []
    setMembers(memberList)
    const me = memberList.find((m: HouseholdMember) => m.user_id === session.user.id)
    setIsAdmin(me?.role === 'admin')
    setLoading(false)
  }

  async function switchHousehold(id: string) {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    await switchActiveHousehold(id, session.user.id)
    await refresh()
  }

  useEffect(() => { refresh() }, [])

  return (
    <HouseholdContext.Provider value={{ household, members, isAdmin, loading, allHouseholds, refresh, switchHousehold }}>
      {children}
    </HouseholdContext.Provider>
  )
}

export const useHousehold = () => useContext(HouseholdContext)
