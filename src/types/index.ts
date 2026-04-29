export interface RecipeCategory {
  id: string
  name: string
}

export interface Recipe {
  id: string
  name: string
  category_id: string | null
  category?: RecipeCategory
  created_at: string
  ingredients?: RecipeIngredient[]
}

export interface RecipeIngredient {
  id: string
  recipe_id: string
  name: string
  quantity: number | null
  unit: string | null
}

export interface CalendarEntry {
  id: string
  date: string
  meal_type: 'breakfast' | 'lunch' | 'dinner'
  recipe_id: string | null
  custom_text: string | null
  leftover_of: string | null
  recipe?: Recipe
}

export interface ShoppingItem {
  id: string
  name: string
  quantity: number | null
  unit: string | null
  is_purchased: boolean
  created_at: string
}

export interface ShoppingHistoryItem {
  id: string
  name: string
  quantity: number | null
  unit: string | null
  purchased_at: string
}

export interface Profile {
  id: string
  username: string
  household_id: string | null
}

export interface Household {
  id: string
  name: string
  join_key: string
  created_by: string | null
  created_at: string
}

export interface HouseholdMember {
  id: string
  household_id: string
  user_id: string
  username: string
  role: 'admin' | 'member'
  joined_at: string
}

export interface Todo {
  id: string
  name: string
  due_date: string
  assigned_to: string
  completed: boolean
  created_at: string
  recurring: boolean
  recur_type: 'daily' | 'weekly' | 'monthly' | null
  recur_interval: number | null
  recur_week_position: 'start' | 'middle' | 'end' | null
  recur_month_day: number | null
}
