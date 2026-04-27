import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ShoppingItem, ShoppingHistoryItem } from '../types'
import { format } from 'date-fns'

interface FrequentItem {
  name: string
  quantity: number | null
  unit: string | null
  count: number
}

export default function ShoppingList() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [history, setHistory] = useState<ShoppingHistoryItem[]>([])
  const [frequent, setFrequent] = useState<FrequentItem[]>([])
  const [input, setInput] = useState('')
  const [tab, setTab] = useState<'list' | 'history'>('list')
  const [loading, setLoading] = useState(true)

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: itemsData }, { data: histData }] = await Promise.all([
      supabase.from('shopping_list_items').select('*').eq('is_purchased', false).order('created_at'),
      supabase.from('shopping_list_history').select('*').order('purchased_at', { ascending: false }).limit(200),
    ])
    setItems(itemsData ?? [])
    setHistory(histData ?? [])
    setFrequent(computeFrequent(histData ?? []))
    setLoading(false)
  }

  function computeFrequent(hist: ShoppingHistoryItem[]): FrequentItem[] {
    const map = new Map<string, FrequentItem>()
    for (const item of hist) {
      const key = item.name.toLowerCase()
      if (map.has(key)) map.get(key)!.count++
      else map.set(key, { name: item.name, quantity: item.quantity, unit: item.unit, count: 1 })
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 15)
  }

  async function addItem(name?: string, quantity?: number | null, unit?: string | null) {
    const text = name ?? input.trim()
    if (!text) return
    const parsed = name ? { name: text, quantity: quantity ?? null, unit: unit ?? null } : parseItem(text)
    const { data } = await supabase
      .from('shopping_list_items')
      .insert({ name: parsed.name, quantity: parsed.quantity, unit: parsed.unit, is_purchased: false })
      .select().single()
    if (data) setItems(prev => [...prev, data])
    if (!name) setInput('')
  }

  async function purchaseItem(item: ShoppingItem) {
    await Promise.all([
      supabase.from('shopping_list_items').delete().eq('id', item.id),
      supabase.from('shopping_list_history').insert({ name: item.name, quantity: item.quantity, unit: item.unit }),
    ])
    setItems(prev => prev.filter(i => i.id !== item.id))
    const { data } = await supabase.from('shopping_list_history').select('*').order('purchased_at', { ascending: false }).limit(200)
    const hist = data ?? []
    setHistory(hist)
    setFrequent(computeFrequent(hist))
  }

  async function deleteItem(id: string) {
    await supabase.from('shopping_list_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function parseItem(text: string): { name: string; quantity: number | null; unit: string | null } {
    const match = text.match(/^([\d.,]+)\s*([a-zA-Z]+)\s+(.+)$/)
    if (match) return { quantity: parseFloat(match[1].replace(',', '.')), unit: match[2], name: match[3] }
    return { name: text, quantity: null, unit: null }
  }

  function formatItem(item: { name: string; quantity: number | null; unit: string | null }) {
    if (item.quantity && item.unit) return `${item.quantity} ${item.unit} ${item.name}`
    if (item.quantity) return `${item.quantity} ${item.name}`
    return item.name
  }

  const alreadyInList = new Set(items.map(i => i.name.toLowerCase()))

  return (
    <div className="max-w-2xl mx-auto px-3 py-5">
      <h2 className="text-xl font-bold text-zinc-100 mb-4">Shopping List</h2>

      <div className="flex gap-2 mb-5">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="e.g. 2 kg tomatoes or just milk"
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
        />
        <button
          onClick={() => addItem()}
          className="bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl px-4 py-2.5 text-sm font-bold transition-colors"
        >
          Add
        </button>
      </div>

      <div className="flex gap-3">
        {/* Left 2/3 */}
        <div className="flex-[2] min-w-0">
          <div className="flex gap-1 mb-3 bg-zinc-800 rounded-xl p-1">
            {(['list', 'history'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                  tab === t ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                }`}
              >
                {t === 'list' ? `List (${items.length})` : 'History'}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : tab === 'list' ? (
            <div className="flex flex-col gap-2">
              {items.length === 0 && (
                <p className="text-center text-zinc-600 py-10 text-sm">List is empty.</p>
              )}
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-3 bg-zinc-900 rounded-xl border border-zinc-800 px-3 py-3 group">
                  <button
                    onClick={() => purchaseItem(item)}
                    className="w-5 h-5 rounded-full border-2 border-zinc-600 hover:border-green-500 hover:bg-green-500/20 flex-shrink-0 transition-all"
                  />
                  <span className="flex-1 text-sm text-zinc-200 truncate">{formatItem(item)}</span>
                  <button onClick={() => deleteItem(item.id)} className="text-zinc-700 hover:text-red-400 text-lg leading-none transition-colors">×</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {history.length === 0 && (
                <p className="text-center text-zinc-600 py-10 text-sm">No history yet.</p>
              )}
              {history.map(item => (
                <div key={item.id} className="flex items-center justify-between bg-zinc-900 rounded-xl border border-zinc-800 px-3 py-2.5">
                  <span className="text-sm text-zinc-400 truncate">{formatItem(item)}</span>
                  <span className="text-xs text-zinc-600 flex-shrink-0 ml-2">{format(new Date(item.purchased_at), 'dd MMM')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right 1/3 — frequent */}
        <div className="flex-[1] min-w-0">
          <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-2">
            <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2 px-1">Frequent</p>
            {frequent.length === 0 ? (
              <p className="text-xs text-zinc-600 text-center py-4">Buy items to see them here.</p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {frequent.map(item => {
                  const inList = alreadyInList.has(item.name.toLowerCase())
                  return (
                    <button
                      key={item.name}
                      onClick={() => !inList && addItem(item.name, item.quantity, item.unit)}
                      disabled={inList}
                      className={`w-full text-left rounded-lg px-2 py-1.5 text-xs transition-colors ${
                        inList
                          ? 'text-zinc-700 cursor-default'
                          : 'text-zinc-300 hover:bg-zinc-800 hover:text-green-400'
                      }`}
                    >
                      <span className="truncate block">{item.name}</span>
                      <span className={`text-[10px] ${inList ? 'text-zinc-700' : 'text-zinc-600'}`}>×{item.count}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
