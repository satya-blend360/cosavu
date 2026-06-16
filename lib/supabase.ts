import { createClient } from "@supabase/supabase-js"
import { createCosavuApiKey } from "@/lib/cosavu-api"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

// Mock mode if variables are missing
export const IS_MOCK_MODE = !supabaseUrl || !supabaseAnonKey

export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseAnonKey || "placeholder"
)

export async function createApiKey(
  userName: string,
  email: string,
  enterpriseId: string = "default"
) {
  const keyString = `csvu_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`
  const fallbackData = {
    id: `local-${Date.now()}`,
    key_string: keyString,
    user_name: userName,
    email,
    enterprise_id: enterpriseId,
    created_at: new Date().toISOString(),
  }

  try {
    const createdKey = await createCosavuApiKey({
      userName,
      email,
      enterpriseName: enterpriseId,
    })

    return {
      api_key: createdKey.api_key,
      data: {
        id: String(createdKey.id),
        key_string: createdKey.api_key,
        user_name: createdKey.user_name,
        email: createdKey.email,
        enterprise_id: createdKey.enterprise_name || enterpriseId,
        created_at: new Date().toISOString(),
      },
      error: null,
    }
  } catch (error: unknown) {
    console.warn("Cosavu API key endpoint unavailable, using fallback.", error)
  }

  if (IS_MOCK_MODE) {
    return { api_key: keyString, data: fallbackData, error: null }
  }

  try {
    const { data, error } = await supabase
      .from("api_keys")
      .insert({
        key_string: keyString,
        user_name: userName,
        email,
        enterprise_id: enterpriseId,
      })
      .select()
      .single()

    if (error) {
      console.error("Failed to persist API key", error)
      return { api_key: keyString, data: fallbackData, error: null }
    }

    return { api_key: keyString, data, error: null }
  } catch (error: unknown) {
    console.error("Failed to persist API key", error)
    return { api_key: keyString, data: fallbackData, error: null }
  }
}

export async function getApiKeys(
  enterpriseId: string = "default",
  email?: string
) {
  if (IS_MOCK_MODE) {
    return { data: [], error: null }
  }

  let query = supabase
    .from("api_keys")
    .select("*")
    .eq("enterprise_id", enterpriseId)
    .order("created_at", { ascending: false })

  if (email) {
    query = query.eq("email", email)
  }

  return await query
}

export async function getUserProfile(userId: string) {
  if (IS_MOCK_MODE) {
    return { data: null, error: null }
  }

  return await supabase.from("profiles").select("*").eq("id", userId).single()
}
