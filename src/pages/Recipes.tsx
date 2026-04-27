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
    const { data } = await supabase
      .from('recipes')
      .select('*, ingredients:recipe_ingredients(*)')
      .order('name')
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
      if (!header.includes('name') || !header.includes('ingredients')) {
        throw new Error('CSV must have "name" and "ingredients" columns')
      }
      for (const line of lines.slice(1)) {
        if (!line.trim()) continue
        const [name, ingredientsRaw] = parseCsvLine(line)
        if (!name) continue
        const { data: recipe } = await supabase
          .from('recipes')
          .insert({ name: name.trim() })
          .select()
          .single()
        if (!recipe) continue
        const ingredientList = ingredientsRaw
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
        const rows = ingredientList.map(raw => {
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
    <div className="max-w-lg mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-800">Recipes</h2>
        <div className="flex gap-2">
          <button
            onClick={() => fileRef.current?.click()}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50"
          >
            Import CSV
          </button>
          <button
            onClick={() => { setEditRecipe(null); setShowForm(true) }}
            className="bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-2 text-sm font-semibold"
          >
            + Add
          </button>
        </div>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
      </div>

      {importError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
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
          <div className="w-6 h-6 border-3 border-green-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {recipes.length === 0 && (
            <p className="text-center text-gray-400 py-10 text-sm">No recipes yet.</p>
          )}
          {recipes.map(recipe => (
            <div key={recipe.id} className="bg-white rounded-xl border border-gray-200">
              <button
                onClick={() => setExpanded(expanded === recipe.id ? null : recipe.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <span className="font-medium text-gray-800 text-sm">{recipe.name}</span>
                <span className="text-gray-400 text-lg">{expanded === recipe.id ? '▲' : '▼'}</span>
              </button>

              {expanded === recipe.id && (
                <div className="border-t border-gray-100 px-4 pb-4 pt-2">
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Ingredients</p>
                  {(recipe.ingredients ?? []).length === 0 ? (
                    <p className="text-sm text-gray-400">No ingredients added.</p>
                  ) : (
                    <ul className="flex flex-col gap-1 mb-3">
                      {(recipe.ingredients ?? []).map(ing => (
                        <li key={ing.id} className="text-sm text-gray-700">
                          {ing.quantity && ing.unit ? `${ing.quantity} ${ing.unit} ` : ing.quantity ? `${ing.quantity} ` : ''}
                          {ing.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2 mt-1">
                    <button
                      onClick={() => { setEditRecipe(recipe); setShowForm(true) }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => deleteRecipe(recipe.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-600 mb-1">CSV Import Format</p>
        <code className="text-xs text-gray-500 block whitespace-pre">
          name,ingredients{'\n'}
          Pasta,"500g pasta, 400g tomatoes, 1 onion"
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

  function addIngredient() {
    setIngredients(prev => [...prev, { name: '', quantity: null, unit: null }])
  }

  function removeIngredient(i: number) {
    setIngredients(prev => prev.filter((_, idx) => idx !== i))
  }

  async function save() {
    if (!name.trim()) return
    setSaving(true)
    if (recipe) {
      await supabase.from('recipes').update({ name: name.trim() }).eq('id', recipe.id)
      await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipe.id)
      const rows = ingredients.filter(i => i.name?.trim()).map(i => ({
        recipe_id: recipe.id,
        name: i.name!.trim(),
        quantity: i.quantity ?? null,
        unit: i.unit ?? null,
      }))
      if (rows.length) await supabase.from('recipe_ingredients').insert(rows)
    } else {
      const { data } = await supabase.from('recipes').insert({ name: name.trim() }).select().single()
      if (data) {
        const rows = ingredients.filter(i => i.name?.trim()).map(i => ({
          recipe_id: data.id,
          name: i.name!.trim(),
          quantity: i.quantity ?? null,
          unit: i.unit ?? null,
        }))
        if (rows.length) await supabase.from('recipe_ingredients').insert(rows)
      }
    }
    setSaving(false)
    onSave()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <h3 className="font-semibold text-gray-800 mb-3">{recipe ? 'Edit Recipe' : 'New Recipe'}</h3>
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Recipe name"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-green-500"
      />
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Ingredients</p>
      <div className="flex flex-col gap-2 mb-3">
        {ingredients.map((ing, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              value={ing.quantity ?? ''}
              onChange={e => updateIng(i, 'quantity', e.target.value)}
              placeholder="Qty"
              type="number"
              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              value={ing.unit ?? ''}
              onChange={e => updateIng(i, 'unit', e.target.value)}
              placeholder="Unit"
              className="w-16 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <input
              value={ing.name ?? ''}
              onChange={e => updateIng(i, 'name', e.target.value)}
              placeholder="Ingredient"
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button onClick={() => removeIngredient(i)} className="text-gray-300 hover:text-red-400 text-lg">×</button>
          </div>
        ))}
      </div>
      <button onClick={addIngredient} className="text-sm text-green-600 hover:underline mb-4">
        + Add ingredient
      </button>
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg py-2 text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button onClick={onCancel} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </div>
  )
}
