import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type { Recipe, RecipeIngredient } from '../types'

export default function Recipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editRecipe, setEditRecipe] = useState<Recipe | null>(null)
  const [loading, setLoading] = useState(true)
  const [importError, setImportError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => { fetchRecipes() }, [])

  async function fetchRecipes() {
    setLoading(true)
    const { data } = await supabase.from('recipes').select('*, ingredients:recipe_ingredients(*)').order('name')
    setRecipes(data ?? [])
    setLoading(false)
  }

  async function deleteRecipe(id: string) {
    if (!confirm('Delete this recipe?')) return
    await supabase.from('recipes').delete().eq('id', id)
    setRecipes(prev => prev.filter(r => r.id !== id))
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    setImportError('')
    const file = e.target.files?.[0]
    if (!file) return
    const text = await file.text()
    try {
      const lines = text.trim().split('\n')
      const header = lines[0].toLowerCase()
      if (!header.includes('name') || !header.includes('ingredients')) throw new Error('CSV must have "name" and "ingredients" columns')
      for (const line of lines.slice(1)) {
        if (!line.trim()) continue
        const [name, ingredientsRaw] = parseCsvLine(line)
        if (!name) continue
        const { data: recipe } = await supabase.from('recipes').insert({ name: name.trim() }).select().single()
        if (!recipe) continue
        const rows = ingredientsRaw.split(',').map(s => s.trim()).filter(Boolean).map(raw => {
          const m = raw.match(/^([\d.,]+)\s*([a-zA-Z]+)\s+(.+)$/)
          if (m) return { recipe_id: recipe.id, quantity: parseFloat(m[1].replace(',', '.')), unit: m[2], name: m[3] }
          return { recipe_id: recipe.id, name: raw, quantity: null, unit: null }
        })
        if (rows.length) await supabase.from('recipe_ingredients').insert(rows)
      }
      await fetchRecipes()
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
    }
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-zinc-100">Recipes</h2>
        <div className="flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm border border-zinc-700 rounded-xl px-3 py-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 transition-colors"
          >
            Import CSV
          </button>
          <button
            onClick={() => { setEditRecipe(null); setShowForm(true) }}
            className="bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl px-3 py-2 text-sm font-bold transition-colors"
          >
            + Add
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
      </div>

      {importError && (
        <div className="mb-4 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-3 py-2">
          {importError}
        </div>
      )}

      {showForm && (
        <RecipeForm
          recipe={editRecipe}
          onSave={async () => { await fetchRecipes(); setShowForm(false) }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-4 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {recipes.length === 0 && (
            <p className="text-center text-zinc-600 py-10 text-sm">No recipes yet.</p>
          )}
          {recipes.map(recipe => (
            <div key={recipe.id} className="bg-zinc-900 rounded-xl border border-zinc-800">
              <button
                onClick={() => setExpanded(expanded === recipe.id ? null : recipe.id)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left"
              >
                <span className="font-medium text-zinc-100 text-sm">{recipe.name}</span>
                <span className="text-zinc-600 text-sm">{expanded === recipe.id ? '▲' : '▼'}</span>
              </button>

              {expanded === recipe.id && (
                <div className="border-t border-zinc-800 px-4 pb-4 pt-3">
                  <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Ingredients</p>
                  {(recipe.ingredients ?? []).length === 0 ? (
                    <p className="text-sm text-zinc-600">No ingredients added.</p>
                  ) : (
                    <ul className="flex flex-col gap-1 mb-3">
                      {(recipe.ingredients ?? []).map(ing => (
                        <li key={ing.id} className="text-sm text-zinc-400">
                          {ing.quantity && ing.unit ? `${ing.quantity} ${ing.unit} ` : ing.quantity ? `${ing.quantity} ` : ''}
                          {ing.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-3 mt-2">
                    <button onClick={() => { setEditRecipe(recipe); setShowForm(true) }} className="text-xs text-green-500 hover:text-green-400 transition-colors">Edit</button>
                    <button onClick={() => deleteRecipe(recipe.id)} className="text-xs text-red-500 hover:text-red-400 transition-colors">Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs font-semibold text-zinc-500 mb-1">CSV Import Format</p>
        <code className="text-xs text-zinc-600 block whitespace-pre font-mono">
          name,ingredients{'\n'}Pasta,"500g pasta, 400g tomatoes"
        </code>
      </div>
    </div>
  )
}

function parseCsvLine(line: string): [string, string] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') { inQuotes = !inQuotes; continue }
    if (ch === ',' && !inQuotes) { result.push(current); current = ''; continue }
    current += ch
  }
  result.push(current)
  return [result[0] ?? '', result[1] ?? '']
}

interface RecipeFormProps {
  recipe: Recipe | null
  onSave: () => void
  onCancel: () => void
}

function RecipeForm({ recipe, onSave, onCancel }: RecipeFormProps) {
  const [name, setName] = useState(recipe?.name ?? '')
  const [ingredients, setIngredients] = useState<Partial<RecipeIngredient>[]>(
    recipe?.ingredients?.length ? recipe.ingredients : [{ name: '', quantity: null, unit: null }]
  )
  const [saving, setSaving] = useState(false)

  function updateIng(i: number, field: keyof RecipeIngredient, value: string) {
    setIngredients(prev => prev.map((ing, idx) =>
      idx === i ? { ...ing, [field]: field === 'quantity' ? (value ? parseFloat(value) : null) : value || null } : ing
    ))
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    if (recipe) {
      await supabase.from('recipes').update({ name: name.trim() }).eq('id', recipe.id)
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipe.id)
      const rows = ingredients.filter(i => i.name?.trim()).map(i => ({ recipe_id: recipe.id, name: i.name!.trim(), quantity: i.quantity ?? null, unit: i.unit ?? null }))
      if (rows.length) await supabase.from('recipe_ingredients').insert(rows)
    } else {
      const { data } = await supabase.from('recipes').insert({ name: name.trim() }).select().single()
      if (data) {
        const rows = ingredients.filter(i => i.name?.trim()).map(i => ({ recipe_id: data.id, name: i.name!.trim(), quantity: i.quantity ?? null, unit: i.unit ?? null }))
        if (rows.length) await supabase.from('recipe_ingredients').insert(rows)
      }
    }
    setSaving(false)
    onSave()
  }

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4 mb-4">
      <h3 className="font-semibold text-zinc-100 mb-3">{recipe ? 'Edit Recipe' : 'New Recipe'}</h3>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Recipe name"
        className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 mb-3 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
      />
      <p className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">Ingredients</p>
      <div className="flex flex-col gap-2 mb-3">
        {ingredients.map((ing, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              value={ing.quantity ?? ''}
              onChange={e => updateIng(i, 'quantity', e.target.value)}
              placeholder="Qty"
              type="number"
              className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <input
              value={ing.unit ?? ''}
              onChange={e => updateIng(i, 'unit', e.target.value)}
              placeholder="Unit"
              className="w-14 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <input
              value={ing.name ?? ''}
              onChange={e => updateIng(i, 'name', e.target.value)}
              placeholder="Ingredient"
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
            <button onClick={() => setIngredients(p => p.filter((_, idx) => idx !== i))} className="text-zinc-700 hover:text-red-400 text-lg transition-colors">×</button>
          </div>
        ))}
      </div>
      <button onClick={() => setIngredients(p => [...p, { name: '', quantity: null, unit: null }])} className="text-sm text-green-500 hover:text-green-400 transition-colors mb-4">
        + Add ingredient
      </button>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="flex-1 bg-green-500 hover:bg-green-400 text-zinc-950 rounded-xl py-2.5 text-sm font-bold disabled:opacity-40 transition-colors">
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="flex-1 border border-zinc-700 rounded-xl py-2.5 text-sm text-zinc-400 hover:bg-zinc-800 transition-colors">
          Cancel
        </button>
      </div>
    </div>
  )
}
