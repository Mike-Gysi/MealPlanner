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
  breakfast: 'bg-amber-400',
  lunch: 'bg-blue-500',
  dinner: 'bg-violet-500',
}
const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'B',
  lunch: 'L',
  dinner: 'D',
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-2 sticky top-[57px] z-30">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 text-lg">‹</button>
        <button onClick={() => navigate(1)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 text-lg">›</button>
        <span className="flex-1 text-sm font-semibold text-gray-800 text-center">{title()}</span>
        <button onClick={() => setCurrent(new Date())} className="text-xs text-green-700 font-medium border border-green-300 rounded-lg px-2 py-1">Today</button>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(['month', 'week', 'day'] as ViewMode[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-2 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                view === v ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar body */}
      <div className="flex-1 overflow-y-auto">
        {view === 'month' && (
          <MonthView days={days} current={current} getEntry={getEntry} openSlot={openSlot} />
        )}
        {view === 'week' && (
          <WeekView days={days} getEntry={getEntry} openSlot={openSlot} />
        )}
        {view === 'day' && (
          <DayView day={current} getEntry={getEntry} openSlot={openSlot} />
        )}
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

interface ViewProps {
  days: Date[]
  current?: Date
  getEntry: (date: Date, meal: MealType) => CalendarEntry | null
  openSlot: (date: Date, meal: MealType) => void
}

function MonthView({ days, current, getEntry, openSlot }: ViewProps) {
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-gray-100">
        {weekDays.map(d => (
          <div key={d} className="text-center text-xs text-gray-400 py-1.5 font-medium">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map(day => {
          const inMonth = current ? isSameMonth(day, current) : true
          const today = isToday(day)
          return (
            <div
              key={day.toISOString()}
              className={`border-b border-r border-gray-100 p-1 min-h-[80px] ${!inMonth ? 'bg-gray-50' : ''}`}
            >
              <div className={`text-xs font-medium mb-1 w-5 h-5 flex items-center justify-center rounded-full ${
                today ? 'bg-green-600 text-white' : inMonth ? 'text-gray-700' : 'text-gray-300'
              }`}>
                {format(day, 'd')}
              </div>
              <div className="flex flex-col gap-0.5">
                {MEAL_TYPES.map(meal => {
                  const entry = getEntry(day, meal)
                  const label = entry?.recipe?.name ?? entry?.custom_text ?? null
                  return (
                    <button
                      key={meal}
                      onClick={() => openSlot(day, meal)}
                      className={`w-full text-left rounded px-1 py-0.5 text-[10px] leading-tight transition-colors ${
                        entry
                          ? `${MEAL_COLORS[meal]} text-white`
                          : 'text-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {entry ? (
                        <span className="truncate block">{MEAL_LABELS[meal]}: {label}</span>
                      ) : (
                        <span>{MEAL_LABELS[meal]}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week View ───────────────────────────────────────────────────────────────

function WeekView({ days, getEntry, openSlot }: ViewProps) {
  return (
    <div className="grid grid-cols-7 divide-x divide-gray-100 min-h-[400px]">
      {days.map(day => {
        const today = isToday(day)
        return (
          <div key={day.toISOString()} className="flex flex-col">
            <div className={`text-center py-2 text-xs font-medium border-b border-gray-100 ${today ? 'text-green-700' : 'text-gray-500'}`}>
              <div>{format(day, 'EEE')}</div>
              <div className={`mx-auto w-6 h-6 flex items-center justify-center rounded-full text-sm ${today ? 'bg-green-600 text-white' : 'text-gray-700'}`}>
                {format(day, 'd')}
              </div>
            </div>
            <div className="flex flex-col gap-1 p-1 flex-1">
              {MEAL_TYPES.map(meal => {
                const entry = getEntry(day, meal)
                const label = entry?.recipe?.name ?? entry?.custom_text ?? null
                return (
                  <button
                    key={meal}
                    onClick={() => openSlot(day, meal)}
                    className={`rounded-lg px-1.5 py-2 text-[10px] font-medium text-left transition-colors min-h-[40px] ${
                      entry
                        ? `${MEAL_COLORS[meal]} text-white`
                        : 'border border-dashed border-gray-200 text-gray-300 hover:border-gray-300'
                    }`}
                  >
                    <div className="font-semibold capitalize">{meal.charAt(0).toUpperCase() + meal.slice(1,1)}{meal.charAt(0)}</div>
                    {label && <div className="truncate leading-tight mt-0.5">{label}</div>}
                  </button>
                )
              })}
            </div>
          </div>
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
  return (
    <div className="max-w-lg mx-auto px-4 py-4 flex flex-col gap-3">
      {MEAL_TYPES.map(meal => {
        const entry = getEntry(day, meal)
        const label = entry?.recipe?.name ?? entry?.custom_text ?? null
        return (
          <button
            key={meal}
            onClick={() => openSlot(day, meal)}
            className={`w-full rounded-2xl p-4 text-left transition-all ${
              entry
                ? `${MEAL_COLORS[meal]} text-white shadow-sm`
                : 'border-2 border-dashed border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className={`text-sm font-semibold capitalize mb-1 ${entry ? 'text-white/80' : 'text-gray-400'}`}>
              {meal}
            </div>
            {label ? (
              <div className="text-base font-semibold">{label}</div>
            ) : (
              <div className="text-gray-400 text-sm">Tap to add</div>
            )}
            {entry?.leftover_of && (
              <div className={`text-xs mt-1 ${entry ? 'text-white/70' : 'text-gray-400'}`}>↩ Leftover</div>
            )}
          </button>
        )
      })}
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-t-2xl p-6 pb-8 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">
            {entry ? 'Edit' : 'Add'} — {format(new Date(date + 'T12:00:00'), 'EEE d MMM')}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">×</button>
        </div>

        <div className="flex gap-2 mb-4">
          {MEAL_TYPES.map(m => (
            <button
              key={m}
              onClick={() => setSelectedMeal(m)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-lg capitalize transition-colors ${
                selectedMeal === m ? `${MEAL_COLORS[m]} text-white` : 'bg-gray-100 text-gray-600'
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
          {(['recipe', 'text'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
                mode === m ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">Select a recipe…</option>
              {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            {recipeId && (
              <label className="flex items-center gap-2 mt-3 text-sm text-gray-700">
                <input type="checkbox" checked={addToShopping} onChange={e => setAddToShopping(e.target.checked)} className="rounded" />
                Add ingredients to shopping list
              </label>
            )}
          </div>
        ) : (
          <input
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            placeholder="What are you eating?"
            className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        )}

        <div className="mb-5">
          <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1">Leftover of (optional)</label>
          <select
            value={leftoverOf}
            onChange={e => setLeftoverOf(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
            className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2.5 text-sm font-semibold disabled:opacity-40"
          >
            {saving ? 'Saving…' : entry ? 'Update' : 'Add'}
          </button>
          {entry && (
            <button onClick={deleteEntry} className="px-4 border border-red-300 text-red-500 hover:bg-red-50 rounded-lg py-2.5 text-sm">
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
