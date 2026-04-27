import { useEffect, useState } from 'react'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, addMonths, addWeeks, addDays,
  isSameMonth, isToday,
} from 'date-fns'
import { supabase } from '../lib/supabase'
import type { CalendarEntry, Recipe } from '../types'

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const
type MealType = typeof MEAL_TYPES[number]

const MEAL_COLORS: Record<MealType, string> = {
  breakfast: 'bg-amber-500',
  lunch: 'bg-blue-500',
  dinner: 'bg-violet-600',
}

const MEAL_BTN_ACTIVE: Record<MealType, string> = {
  breakfast: 'bg-amber-500 text-zinc-950',
  lunch: 'bg-blue-500 text-white',
  dinner: 'bg-violet-600 text-white',
}

type ViewMode = 'month' | 'week' | 'day'

export default function CalendarPage() {
  const [current, setCurrent] = useState(new Date())
  const [view, setView] = useState<ViewMode>('month')
  const [entries, setEntries] = useState<CalendarEntry[]>([])
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [modal, setModal] = useState<{ date: string; meal: MealType; entry: CalendarEntry | null } | null>(null)

  useEffect(() => { fetchEntries(); fetchRecipes() }, [])

  async function fetchEntries() {
    const { data } = await supabase
      .from('calendar_entries')
      .select('*, recipe:recipes(id, name, ingredients:recipe_ingredients(*))')
    setEntries(data ?? [])
  }

  async function fetchRecipes() {
    const { data } = await supabase.from('recipes').select('*, ingredients:recipe_ingredients(*)').order('name')
    setRecipes(data ?? [])
  }

  function getEntry(date: Date, meal: MealType): CalendarEntry | null {
    const d = format(date, 'yyyy-MM-dd')
    return entries.find(e => e.date === d && e.meal_type === meal) ?? null
  }

  function openSlot(date: Date, meal: MealType) {
    setModal({ date: format(date, 'yyyy-MM-dd'), meal, entry: getEntry(date, meal) })
  }

  function openDay(date: Date) {
    setCurrent(date)
    setView('day')
  }

  function navigate(dir: 1 | -1) {
    if (view === 'month') setCurrent(d => addMonths(d, dir))
    else if (view === 'week') setCurrent(d => addWeeks(d, dir))
    else setCurrent(d => addDays(d, dir))
  }

  function title() {
    if (view === 'month') return format(current, 'MMMM yyyy')
    if (view === 'week') {
      const start = startOfWeek(current, { weekStartsOn: 1 })
      const end = endOfWeek(current, { weekStartsOn: 1 })
      return `${format(start, 'd MMM')} – ${format(end, 'd MMM yyyy')}`
    }
    return format(current, 'EEEE, d MMMM yyyy')
  }

  function daysForView(): Date[] {
    if (view === 'month') {
      const start = startOfWeek(startOfMonth(current), { weekStartsOn: 1 })
      const end = endOfWeek(endOfMonth(current), { weekStartsOn: 1 })
      return eachDayOfInterval({ start, end })
    }
    if (view === 'week') {
      const start = startOfWeek(current, { weekStartsOn: 1 })
      const end = endOfWeek(current, { weekStartsOn: 1 })
      return eachDayOfInterval({ start, end })
    }
    return [current]
  }

  const days = daysForView()

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header — title + view toggle */}
      <div className="bg-zinc-900 border-b border-zinc-800 px-3 py-3 flex items-center gap-2 flex-shrink-0 z-30">
        <span className="flex-1 text-sm font-semibold text-zinc-100">{title()}</span>
        <button onClick={() => setCurrent(new Date())} className="text-xs text-green-400 font-medium border border-green-500/30 rounded-lg px-2 py-1 hover:bg-green-500/10 transition-colors">Today</button>
      </div>

      {/* Calendar body */}
      <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
        {view === 'month' && (
          <MonthView days={days} current={current} getEntry={getEntry} openDay={openDay} />
        )}
        {view === 'week' && (
          <WeekView days={days} getEntry={getEntry} openDay={openDay} />
        )}
        {view === 'day' && (
          <DayView day={current} getEntry={getEntry} openSlot={openSlot} />
        )}
      </div>

      {/* Bottom navigation arrows + view toggle */}
      <div className="bg-zinc-900 border-t border-zinc-800 flex items-center justify-between px-4 py-3 flex-shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-14 h-14 flex items-center justify-center rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-3xl font-light transition-colors"
        >
          ‹
        </button>
        <div className="flex bg-zinc-800 rounded-xl p-1 gap-1">
          {(['month', 'week', 'day'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-2 text-sm font-medium rounded-lg capitalize transition-colors ${
                view === v ? 'bg-zinc-600 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <button
          onClick={() => navigate(1)}
          className="w-14 h-14 flex items-center justify-center rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-3xl font-light transition-colors"
        >
          ›
        </button>
      </div>

      {modal && (
        <MealModal
          date={modal.date}
          meal={modal.meal}
          entry={modal.entry}
          recipes={recipes}
          allEntries={entries}
          onClose={() => setModal(null)}
          onSaved={async () => { await fetchEntries(); setModal(null) }}
        />
      )}
    </div>
  )
}

// ── Month View ──────────────────────────────────────────────────────────────


interface MonthWeekProps {
  days: Date[]
  current?: Date
  getEntry: (date: Date, meal: MealType) => CalendarEntry | null
  openDay: (date: Date) => void
}

function MonthView({ days, current, getEntry, openDay }: MonthWeekProps) {
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const numWeeks = days.length / 7
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="grid grid-cols-7 border-b border-zinc-800 flex-shrink-0">
        {weekDays.map(d => (
          <div key={d} className="text-center text-xs text-zinc-600 py-2 font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1" style={{ gridTemplateRows: `repeat(${numWeeks}, 1fr)` }}>
        {days.map(day => {
          const inMonth = current ? isSameMonth(day, current) : true
          const today = isToday(day)
          const meals = MEAL_TYPES.map(m => ({ meal: m, entry: getEntry(day, m) })).filter(x => x.entry)
          return (
            <button
              key={day.toISOString()}
              onClick={() => openDay(day)}
              className={`border-b border-r border-zinc-800 p-1 flex flex-col items-start justify-start gap-0.5 transition-colors hover:bg-zinc-800/50 ${!inMonth ? 'opacity-30' : ''}`}
            >
              <div className={`text-xs font-medium w-5 h-5 flex items-center justify-center rounded-full mb-0.5 ${
                today ? 'bg-green-500 text-zinc-950 font-bold' : 'text-zinc-300'
              }`}>
                {format(day, 'd')}
              </div>
              {meals.map(({ meal, entry }) => {
                const label = entry?.recipe?.name ?? entry?.custom_text ?? ''
                return (
                  <span key={meal} className={`w-full truncate rounded px-1 py-0.5 text-[9px] font-medium leading-tight text-white ${MEAL_COLORS[meal]}`}>
                    {label}
                  </span>
                )
              })}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Week View ───────────────────────────────────────────────────────────────

function WeekView({ days, getEntry, openDay }: MonthWeekProps) {
  return (
    <div className="grid grid-cols-7 divide-x divide-zinc-800 flex-1 min-h-0">
      {days.map(day => {
        const today = isToday(day)
        const meals = MEAL_TYPES.map(m => ({ meal: m, entry: getEntry(day, m) })).filter(x => x.entry)
        return (
          <button
            key={day.toISOString()}
            onClick={() => openDay(day)}
            className="flex flex-col items-center justify-start pt-3 pb-2 px-1 gap-2 hover:bg-zinc-800/50 transition-colors"
          >
            <div className={`text-xs font-medium ${today ? 'text-green-400' : 'text-zinc-500'}`}>
              {format(day, 'EEE')}
            </div>
            <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold ${
              today ? 'bg-green-500 text-zinc-950' : 'text-zinc-200'
            }`}>
              {format(day, 'd')}
            </div>
            <div className="flex flex-col gap-1 w-full">
              {meals.map(({ meal, entry }) => {
                const label = entry?.recipe?.name ?? entry?.custom_text ?? ''
                return (
                  <span key={meal} className={`w-full truncate rounded-md px-1 py-1 text-[10px] font-medium leading-tight text-white text-center ${MEAL_COLORS[meal]}`}>
                    {label}
                  </span>
                )
              })}
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ── Day View ────────────────────────────────────────────────────────────────

interface DayViewProps {
  day: Date
  getEntry: (date: Date, meal: MealType) => CalendarEntry | null
  openSlot: (date: Date, meal: MealType) => void
}

function DayView({ day, getEntry, openSlot }: DayViewProps) {
  const plannedMeals = MEAL_TYPES.map(m => ({ meal: m, entry: getEntry(day, m) }))
  const nextMeal = MEAL_TYPES.find(m => !getEntry(day, m)) ?? 'dinner'

  return (
    <div className="max-w-lg mx-auto px-4 py-4 flex flex-col gap-3 flex-1 min-h-0">
      {plannedMeals.map(({ meal, entry }) => {
        const label = entry?.recipe?.name ?? entry?.custom_text ?? null
        if (!entry) return null
        return (
          <button
            key={meal}
            onClick={() => openSlot(day, meal)}
            className={`w-full rounded-2xl p-4 text-left shadow-lg ${MEAL_COLORS[meal]}`}
          >
            <div className="text-xs font-semibold capitalize text-white/70 mb-1 uppercase tracking-wide">{meal}</div>
            <div className="text-base font-bold text-white">{label}</div>
            {entry.leftover_of && <div className="text-xs mt-1 text-white/60">↩ Leftover</div>}
          </button>
        )
      })}

      <button
        onClick={() => openSlot(day, nextMeal)}
        className="w-full rounded-2xl p-4 text-left border-2 border-dashed border-zinc-700 hover:border-green-500/50 hover:bg-green-500/5 transition-all text-zinc-600 hover:text-green-400"
      >
        + Add meal
      </button>
    </div>
  )
}

// ── Meal Modal ───────────────────────────────────────────────────────────────

interface MealModalProps {
  date: string
  meal: MealType
  entry: CalendarEntry | null
  recipes: Recipe[]
  allEntries: CalendarEntry[]
  onClose: () => void
  onSaved: () => void
}

function MealModal({ date, meal, entry, recipes, allEntries, onClose, onSaved }: MealModalProps) {
  const [selectedMeal, setSelectedMeal] = useState<MealType>(meal)
  const [mode, setMode] = useState<'recipe' | 'text'>(entry?.recipe_id ? 'recipe' : 'text')
  const [recipeId, setRecipeId] = useState(entry?.recipe_id ?? '')
  const [customText, setCustomText] = useState(entry?.custom_text ?? '')
  const [leftoverOf, setLeftoverOf] = useState(entry?.leftover_of ?? '')

  function handleLeftoverChange(id: string) {
    setLeftoverOf(id)
    if (id) {
      const source = allEntries.find(e => e.id === id)
      const sourceName = source?.recipe?.name ?? source?.custom_text ?? ''
      setCustomText(`Leftover - ${sourceName}`)
      setMode('text')
    }
  }
  const [addToShopping, setAddToShopping] = useState(false)
  const [saving, setSaving] = useState(false)

  const otherEntries = allEntries.filter(e => e.id !== entry?.id)

  async function save() {
    setSaving(true)
    const payload = {
      date,
      meal_type: selectedMeal,
      recipe_id: mode === 'recipe' && recipeId ? recipeId : null,
      custom_text: mode === 'text' && customText.trim() ? customText.trim() : null,
      leftover_of: leftoverOf || null,
    }
    if (entry) {
      await supabase.from('calendar_entries').update(payload).eq('id', entry.id)
    } else {
      await supabase.from('calendar_entries').insert(payload)
    }
    if (addToShopping && mode === 'recipe' && recipeId) {
      await mergeIngredientsToShoppingList(recipeId, recipes)
    }
    setSaving(false)
    onSaved()
  }

  async function deleteEntry() {
    if (!entry) return
    await supabase.from('calendar_entries').delete().eq('id', entry.id)
    onSaved()
  }

  const canSave = mode === 'recipe' ? !!recipeId : !!customText.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 w-full max-w-lg rounded-2xl p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-semibold text-zinc-100">
            {entry ? 'Edit meal' : 'Add meal'} — {format(new Date(date + 'T12:00:00'), 'EEE d MMM')}
          </h3>
          <button onClick={onClose} className="text-zinc-600 hover:text-zinc-300 text-2xl leading-none transition-colors">×</button>
        </div>

        <div className="flex gap-2 mb-4">
          {MEAL_TYPES.map(m => (
            <button
              key={m}
              onClick={() => setSelectedMeal(m)}
              className={`flex-1 py-2 text-sm font-semibold rounded-xl capitalize transition-all ${
                selectedMeal === m ? MEAL_BTN_ACTIVE[m] : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-zinc-800 rounded-xl p-1 mb-4">
          {(['recipe', 'text'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                mode === m ? 'bg-zinc-700 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {m === 'recipe' ? 'From recipe' : 'Custom text'}
            </button>
          ))}
        </div>

        {mode === 'recipe' ? (
          <div className="mb-4">
            <select
              value={recipeId}
              onChange={e => setRecipeId(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            >
              <option value="">Select a recipe…</option>
              {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {recipeId && (
              <label className="flex items-center gap-2 mt-3 text-sm text-zinc-400">
                <input type="checkbox" checked={addToShopping} onChange={e => setAddToShopping(e.target.checked)} className="rounded accent-green-500" />
                Add ingredients to shopping list
              </label>
            )}
          </div>
        ) : (
          <input
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            placeholder="What are you eating?"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 mb-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
        )}

        <div className="mb-5">
          <label className="block text-xs text-zinc-600 uppercase tracking-wide mb-1.5">Leftover of (optional)</label>
          <select
            value={leftoverOf}
            onChange={e => handleLeftoverChange(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="">— None —</option>
            {otherEntries.map(e => (
              <option key={e.id} value={e.id}>
                {format(new Date(e.date + 'T12:00:00'), 'EEE d MMM')} {e.meal_type} — {e.recipe?.name ?? e.custom_text}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving || !canSave}
            className="flex-1 bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-30 transition-colors"
          >
            {saving ? 'Saving…' : entry ? 'Update' : 'Add'}
          </button>
          {entry && (
            <button onClick={deleteEntry} className="px-4 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl py-2.5 text-sm transition-colors">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

async function mergeIngredientsToShoppingList(recipeId: string, recipes: Recipe[]) {
  const recipe = recipes.find(r => r.id === recipeId)
  if (!recipe?.ingredients?.length) return
  const { data: existing } = await supabase.from('shopping_list_items').select('*').eq('is_purchased', false)
  const existingMap = new Map<string, { id: string; quantity: number | null }>()
  for (const item of existing ?? []) {
    existingMap.set(`${item.name.toLowerCase()}|${item.unit ?? ''}`, item)
  }
  for (const ing of recipe.ingredients) {
    const key = `${ing.name.toLowerCase()}|${ing.unit ?? ''}`
    const match = existingMap.get(key)
    if (match) {
      await supabase.from('shopping_list_items').update({ quantity: (match.quantity ?? 0) + (ing.quantity ?? 0) }).eq('id', match.id)
    } else {
      await supabase.from('shopping_list_items').insert({ name: ing.name, quantity: ing.quantity, unit: ing.unit, is_purchased: false })
    }
  }
}
