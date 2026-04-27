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
      if (map.has(key)) {
        map.get(key)!.count++
      } else {
        map.set(key, { name: item.name, quantity: item.quantity, unit: item.unit, count: 1 })
      }
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
      .select()
      .single()
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
    <div className="max-w-2xl mx-auto px-3 py-4">
      <h2 className="text-xl font-bold text-gray-800 mb-3">Shopping List</h2>

      {/* Add input */}
      <div className="flex gap-2 mb-4">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addItem()}
          placeholder="e.g. 2 kg tomatoes or just milk"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
        <button
          onClick={() => addItem()}
          className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-4 py-2.5 text-sm font-semibold"
        >
          Add
        </button>
      </div>

      {/* 2/3 + 1/3 split */}
      <div className="flex gap-3">
        {/* Left: 2/3 — list + history */}
        <div className="flex-[2] min-w-0">
          <div className="flex gap-1 mb-3 bg-gray-100 rounded-lg p-1">
            {(['list', 'history'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  tab === t ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
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
                <p className="text-center text-gray-400 py-8 text-sm">List is empty.</p>
              )}
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-2 bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                  <button
                    onClick={() => purchaseItem(item)}
                    className="w-5 h-5 rounded-full border-2 border-gray-300 hover:border-green-500 hover:bg-green-50 flex-shrink-0 transition-colors"
                    title="Mark as purchased"
                  />
                  <span className="flex-1 text-sm text-gray-800 truncate">{formatItem(item)}</span>
                  <button onClick={() => deleteItem(item.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none flex-shrink-0">×</button>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {history.length === 0 && (
                <p className="text-center text-gray-400 py-8 text-sm">No history yet.</p>
              )}
              {history.map(item => (
                <div key={item.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                  <span className="text-sm text-gray-600 truncate">{formatItem(item)}</span>
                  <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{format(new Date(item.purchased_at), 'dd MMM')}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: 1/3 — frequent items */}
        <div className="flex-[1] min-w-0">
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-2">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-1">Frequent</p>
            {frequent.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Buy items to see them here.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {frequent.map(item => {
                  const inList = alreadyInList.has(item.name.toLowerCase())
                  return (
                    <button
                      key={item.name}
                      onClick={() => !inList && addItem(item.name, item.quantity, item.unit)}
                      disabled={inList}
                      className={`w-full text-left rounded-lg px-2 py-1.5 text-xs transition-colors ${
                        inList
                          ? 'text-gray-300 cursor-default'
                          : 'text-gray-700 hover:bg-green-50 hover:text-green-700'
                      }`}
                    >
                      <span className="truncate block">{item.name}</span>
                      <span className={`text-[10px] ${inList ? 'text-gray-300' : 'text-gray-400'}`}>×{item.count}</span>
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
