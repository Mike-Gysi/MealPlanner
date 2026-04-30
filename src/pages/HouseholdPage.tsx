import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { createHousehold, joinHousehold, setMemberRole, deleteHousehold, exportHouseholdData, importHouseholdData, regenerateApiKey, type HouseholdExport, type ImportSummary } from '../lib/household'
import { supabaseUrl } from '../lib/supabase'
import { useHousehold } from '../contexts/HouseholdContext'
import type { HouseholdMember } from '../types'

export default function HouseholdPage() {
  const { household, members, isAdmin, allHouseholds, refresh, switchHousehold } = useHousehold()
  const [currentUserId, setCurrentUserId] = useState('')

  const [copied, setCopied] = useState(false)
  const [showCreateHH, setShowCreateHH] = useState(false)
  const [showJoinHH, setShowJoinHH] = useState(false)
  const [hhName, setHhName] = useState('')
  const [hhKey, setHhKey] = useState('')
  const [hhError, setHhError] = useState('')
  const [hhLoading, setHhLoading] = useState(false)
  const [switching, setSwitching] = useState<string | null>(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const [copiedKey, setCopiedKey] = useState<'endpoint' | 'apikey' | null>(null)
  const [regenerating, setRegenerating] = useState(false)

  const [exporting, setExporting] = useState(false)
  const [importPreview, setImportPreview] = useState<HouseholdExport | null>(null)
  const [importError, setImportError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importDone, setImportDone] = useState<ImportSummary | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? '')
    })
  }, [])

  const inputClass = "w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"

  async function copyKey() {
    if (!household) return
    await navigator.clipboard.writeText(household.join_key)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleCreateHH() {
    if (!hhName.trim()) return
    setHhLoading(true)
    setHhError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setHhError('Not authenticated'); setHhLoading(false); return }
    const uname = session.user.user_metadata?.username ?? 'Unknown'
    const { error: err } = await createHousehold(hhName.trim(), session.user.id, uname)
    if (err) { setHhError(err); setHhLoading(false); return }
    setHhName('')
    setShowCreateHH(false)
    await refresh()
    setHhLoading(false)
  }

  async function handleJoinHH() {
    if (!hhKey.trim()) return
    setHhLoading(true)
    setHhError('')
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setHhError('Not authenticated'); setHhLoading(false); return }
    const uname = session.user.user_metadata?.username ?? 'Unknown'
    const { error: err } = await joinHousehold(hhKey.trim(), session.user.id, uname)
    if (err) { setHhError(err); setHhLoading(false); return }
    setHhKey('')
    setShowJoinHH(false)
    await refresh()
    setHhLoading(false)
  }

  async function handleDeleteHousehold() {
    if (!household) return
    setDeleting(true)
    setDeleteError('')
    const { error } = await deleteHousehold(household.id)
    if (error) {
      setDeleteError(error)
      setDeleting(false)
      return
    }
    const others = allHouseholds.filter(m => m.household.id !== household.id)
    if (others.length > 0) {
      await switchHousehold(others[0].household.id)
    } else {
      await refresh()
    }
    setShowDeleteModal(false)
    setDeleting(false)
  }

  async function copyShortcutValue(value: string, which: 'endpoint' | 'apikey') {
    await navigator.clipboard.writeText(value)
    setCopiedKey(which)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  async function handleRegenerateApiKey() {
    if (!household) return
    setRegenerating(true)
    const { apiKey, error } = await regenerateApiKey(household.id)
    if (!error && apiKey) await refresh()
    setRegenerating(false)
  }

  async function handleExport() {
    if (!household) return
    setExporting(true)
    await exportHouseholdData(household.id, household.name)
    setExporting(false)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target?.result as string) as HouseholdExport
        if (parsed.version !== 1) throw new Error('Unsupported file version')
        if (!Array.isArray(parsed.recipes) || !Array.isArray(parsed.todos)) throw new Error('Invalid file format')
        setImportPreview(parsed)
        setImportError('')
        setImportDone(null)
      } catch (err) {
        setImportError((err as Error).message)
      }
    }
    reader.readAsText(file)
  }

  async function handleImport() {
    if (!importPreview || !household) return
    setImporting(true)
    setImportError('')
    const { imported, error } = await importHouseholdData(household.id, importPreview)
    if (error) {
      setImportError(error)
    } else {
      setImportDone(imported)
      setImportPreview(null)
    }
    setImporting(false)
  }

  async function handleSwitch(id: string) {
    setSwitching(id)
    await switchHousehold(id)
    setSwitching(null)
  }

  async function toggleRole(member: HouseholdMember) {
    if (!household) return
    const newRole = member.role === 'admin' ? 'member' : 'admin'
    await setMemberRole(household.id, member.user_id, newRole)
    await refresh()
  }

  return (
    <div className="max-w-sm mx-auto px-4 py-6 flex flex-col gap-6">
      <h2 className="text-xl font-bold text-zinc-100">Household</h2>

      {/* Household switcher */}
      {allHouseholds.length > 0 && (
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-3 flex flex-col gap-1.5">
          {allHouseholds.map(({ household: hh, role }) => {
            const isActive = hh.id === household?.id
            return (
              <div
                key={hh.id}
                className={`flex items-center justify-between rounded-xl px-3 py-2.5 ${
                  isActive ? 'bg-green-500/10 border border-green-500/20' : 'bg-zinc-800'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isActive && <span className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />}
                  <span className={`text-sm font-medium truncate ${isActive ? 'text-zinc-100' : 'text-zinc-400'}`}>
                    {hh.name}
                  </span>
                  <span className="text-[10px] text-zinc-600 flex-shrink-0 capitalize">{role}</span>
                </div>
                {isActive ? (
                  <span className="text-[10px] text-green-500 font-semibold flex-shrink-0">Active</span>
                ) : (
                  <button
                    onClick={() => handleSwitch(hh.id)}
                    disabled={switching === hh.id}
                    className="flex-shrink-0 text-xs text-green-400 border border-green-500/30 rounded-lg px-2.5 py-1 hover:bg-green-500/10 transition-colors disabled:opacity-40"
                  >
                    {switching === hh.id ? '…' : 'Switch'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Active household details */}
      {household && (
        <div className="bg-zinc-900 rounded-2xl border border-zinc-800 p-5 flex flex-col gap-4">
          {/* Invite key */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1.5">Invite Key</label>
            <div className="flex gap-2">
              <p className="flex-1 text-sm font-mono font-semibold text-green-400 bg-zinc-800 rounded-xl px-3 py-2.5 tracking-widest">{household.join_key}</p>
              <button
                onClick={copyKey}
                className="bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-[10px] text-zinc-600 mt-1.5 px-1">Share this key with others so they can join your household.</p>
          </div>

          {/* Siri Shortcut */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Siri Shortcut</label>
            <div className="flex flex-col gap-2">
              {[
                { label: 'Endpoint', value: `${supabaseUrl}/functions/v1/add-shopping-item`, which: 'endpoint' as const },
                { label: 'API Key', value: household.api_key ?? '—', which: 'apikey' as const },
              ].map(({ label, value, which }) => (
                <div key={which}>
                  <p className="text-[10px] text-zinc-600 mb-1">{label}</p>
                  <div className="flex gap-2">
                    <p className="flex-1 text-xs font-mono text-zinc-400 bg-zinc-800 rounded-xl px-3 py-2 truncate">{value}</p>
                    <button
                      onClick={() => copyShortcutValue(value, which)}
                      className="flex-shrink-0 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-xl px-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                    >
                      {copiedKey === which ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-zinc-600 leading-relaxed mt-1">
                In the Shortcuts app, create a shortcut with <span className="text-zinc-400">Get Contents of URL</span> (POST, JSON body: <span className="text-zinc-400">{`{ "item": ..., "key": ... }`}</span>) and add it to Siri.
              </p>
              {isAdmin && (
                <button
                  onClick={handleRegenerateApiKey}
                  disabled={regenerating}
                  className="self-start text-[11px] text-zinc-600 hover:text-zinc-400 disabled:opacity-40 transition-colors"
                >
                  {regenerating ? 'Regenerating…' : 'Regenerate key'}
                </button>
              )}
            </div>
          </div>

          {/* Members */}
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">
              Members ({members.length})
            </label>
            <div className="flex flex-col gap-1.5">
              {members.map(member => (
                <div key={member.id} className="flex items-center justify-between bg-zinc-800 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {member.role === 'admin' && <span className="text-sm leading-none">👑</span>}
                    <span className={`text-sm truncate ${member.user_id === currentUserId ? 'text-zinc-100 font-semibold' : member.role === 'admin' ? 'text-zinc-200' : 'text-zinc-400'}`}>
                      {member.username}
                      {member.user_id === currentUserId && <span className="text-zinc-600 font-normal"> (you)</span>}
                    </span>
                  </div>
                  {isAdmin && member.user_id !== currentUserId && (
                    <button
                      onClick={() => toggleRole(member)}
                      className="text-[11px] text-zinc-600 hover:text-zinc-300 flex-shrink-0 ml-2 transition-colors"
                    >
                      {member.role === 'admin' ? 'Remove admin' : 'Make admin'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-zinc-800" />

          {/* Export / Import */}
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex-1 flex items-center justify-center gap-1.5 border border-zinc-700 rounded-xl py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 disabled:opacity-40 transition-colors"
            >
              <span className="text-base leading-none">↓</span>
              {exporting ? 'Exporting…' : 'Export data'}
            </button>
            <label className="flex-1 flex items-center justify-center gap-1.5 border border-zinc-700 rounded-xl py-2 text-sm text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 cursor-pointer transition-colors">
              <span className="text-base leading-none">↑</span>
              Import data
              <input type="file" accept=".json,application/json" onChange={handleFileSelect} className="hidden" />
            </label>
          </div>

          {importError && (
            <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{importError}</p>
          )}
          {importDone && (
            <p className="text-xs text-green-400 bg-green-400/10 rounded-lg px-3 py-2">
              Imported: {importDone.recipes} recipes, {importDone.calendarEntries} meal entries, {importDone.shoppingItems} shopping items, {importDone.todos} todos.
            </p>
          )}

          {isAdmin && (
            <>
              <div className="border-t border-zinc-800" />
              <button
                onClick={() => { setShowDeleteModal(true); setDeleteError('') }}
                className="w-full text-sm text-red-400/70 hover:text-red-400 transition-colors text-left"
              >
                Delete this household…
              </button>
            </>
          )}
        </div>
      )}

      {/* Create / Join controls */}
      <div className="flex flex-col gap-2">
        <button
          onClick={() => { setShowCreateHH(v => !v); setShowJoinHH(false); setHhError('') }}
          className="w-full border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 rounded-xl py-2.5 text-sm transition-colors"
        >
          {showCreateHH ? 'Cancel' : household ? 'Create new household' : 'Create a household'}
        </button>

        {showCreateHH && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
            <input
              value={hhName}
              onChange={e => setHhName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateHH()}
              placeholder="Household name"
              className={inputClass}
            />
            {hhError && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{hhError}</p>}
            <button
              onClick={handleCreateHH}
              disabled={hhLoading || !hhName.trim()}
              className="bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-30 transition-colors"
            >
              {hhLoading ? 'Creating…' : 'Create'}
            </button>
          </div>
        )}

        <button
          onClick={() => { setShowJoinHH(v => !v); setShowCreateHH(false); setHhError('') }}
          className="w-full border border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600 rounded-xl py-2.5 text-sm transition-colors"
        >
          {showJoinHH ? 'Cancel' : 'Join another household'}
        </button>

        {showJoinHH && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3">
            <input
              value={hhKey}
              onChange={e => setHhKey(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoinHH()}
              placeholder="INVITATION-KEY"
              className={`${inputClass} uppercase tracking-widest font-mono`}
              maxLength={8}
            />
            {hhError && <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{hhError}</p>}
            <button
              onClick={handleJoinHH}
              disabled={hhLoading || !hhKey.trim()}
              className="bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-30 transition-colors"
            >
              {hhLoading ? 'Joining…' : 'Join'}
            </button>
          </div>
        )}
      </div>

      {/* Import preview modal */}
      {importPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => !importing && setImportPreview(null)}>
          <div className="bg-zinc-900 border border-zinc-700 w-full max-w-sm rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800">
              <p className="text-[10px] text-zinc-500 uppercase tracking-wide mb-0.5">Importing from</p>
              <h3 className="font-semibold text-zinc-100">{importPreview.household_name}</h3>
              <p className="text-xs text-zinc-600 mt-0.5">
                Exported {new Date(importPreview.exported_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                {[
                  { label: 'Recipes', count: importPreview.recipes.length },
                  { label: 'Meal plan entries', count: importPreview.calendar_entries.length },
                  { label: 'Shopping items', count: importPreview.shopping_list.length },
                  { label: 'Todos', count: importPreview.todos.length },
                ].map(({ label, count }) => (
                  <div key={label} className="flex items-center justify-between bg-zinc-800 rounded-xl px-3 py-2">
                    <span className="text-sm text-zinc-400">{label}</span>
                    <span className={`text-sm font-semibold tabular-nums ${count > 0 ? 'text-zinc-100' : 'text-zinc-600'}`}>{count}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                This will <span className="text-zinc-300">add</span> to your current household. Existing data will not be replaced or removed.
              </p>
              {importError && (
                <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{importError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setImportPreview(null)}
                  disabled={importing}
                  className="flex-1 border border-zinc-700 rounded-xl py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="flex-1 bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-40 transition-colors"
                >
                  {importing ? 'Importing…' : 'Import'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete household modal */}
      {showDeleteModal && household && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="bg-zinc-900 border border-red-500/30 w-full max-w-sm rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-800 flex items-center gap-3">
              <span className="text-xl leading-none">⚠️</span>
              <h3 className="font-semibold text-red-400">Delete "{household.name}"?</h3>
            </div>
            <div className="p-5 flex flex-col gap-4">
              <p className="text-sm text-zinc-300 leading-relaxed">
                This will permanently delete the household and <span className="text-zinc-100 font-medium">all of its data</span> for every member:
              </p>
              <ul className="flex flex-col gap-1.5">
                {['All recipes', 'The entire meal plan', 'Shopping list & history', 'All todos', 'Activity log'].map(item => (
                  <li key={item} className="flex items-center gap-2 text-sm text-zinc-400">
                    <span className="w-1 h-1 rounded-full bg-red-500/60 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-zinc-500">This cannot be undone.</p>
              {deleteError && (
                <p className="text-red-400 text-xs bg-red-400/10 rounded-lg px-3 py-2">{deleteError}</p>
              )}
              <div className="flex gap-2 mt-1">
                <button
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deleting}
                  className="flex-1 border border-zinc-700 rounded-xl py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 disabled:opacity-30 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteHousehold}
                  disabled={deleting}
                  className="flex-1 bg-red-500 hover:bg-red-400 text-white rounded-xl py-2.5 text-sm font-bold disabled:opacity-40 transition-colors"
                >
                  {deleting ? 'Deleting…' : 'Delete everything'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
