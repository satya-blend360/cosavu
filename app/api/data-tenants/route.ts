import { NextResponse } from "next/server"

import { COSAVU_ENDPOINTS } from "@/lib/cosavu-api"

export const runtime = "nodejs"

function getAdminToken() {
  return (
    process.env.COSAVU_ADMIN_TOKEN ||
    process.env.COSAVU_DATA_ADMIN_TOKEN ||
    process.env.DATAAPI_ADMIN_TOKEN ||
    process.env.NEXT_PUBLIC_COSAVU_ADMIN_TOKEN
  )
}

function getAdminHeaders(): Record<string, string> {
  const adminToken = getAdminToken()

  if (!adminToken) return {}

  return {
    "X-Admin-Token": adminToken,
  }
}

async function readDataApiError(response: Response) {
  const fallback = `DataAPI request failed with ${response.status}.`

  try {
    const payload = (await response.json()) as {
      error?: string
      detail?: string
      message?: string
    }

    return payload.error || payload.detail || payload.message || fallback
  } catch {
    return fallback
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const email = searchParams.get("email")
    const adminHeaders = getAdminHeaders()

    let url = COSAVU_ENDPOINTS.data.tenants
    if (email) {
      url += `?owner_email=${encodeURIComponent(email)}`
    }

    console.log(`[DataTenants API] GET ${url}`)

    const response = await fetch(url, {
      headers: adminHeaders,
      cache: "no-store",
    })

    if (!response.ok) {
      const errorText = await readDataApiError(response)
      console.error(
        `[DataTenants API] Backend returned ${response.status}: ${errorText}`
      )
      return NextResponse.json(
        { error: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error("[DataTenants API] GET Error:", error)
    const message =
      error instanceof Error ? error.message : "Unable to list DataAPI tenants."

    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const adminHeaders = getAdminHeaders()
    const body = await req.json().catch(() => ({}))

    const { name, slug, keyName, ownerEmail } = body as {
      name?: string
      slug?: string
      keyName?: string
      ownerEmail?: string
    }

    console.log(`[DataTenants API] POST ${COSAVU_ENDPOINTS.data.tenants}`, {
      name,
      slug,
      ownerEmail,
    })

    if (!name?.trim() || !slug?.trim()) {
      return NextResponse.json(
        { error: "Tenant name and slug are required." },
        { status: 400 }
      )
    }

    const response = await fetch(COSAVU_ENDPOINTS.data.tenants, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...adminHeaders,
      },
      body: JSON.stringify({
        name: name.trim(),
        slug: slug.trim(),
        owner_email: ownerEmail?.trim() || null,
        key_name: keyName?.trim() || "Console key",
      }),
    })

    if (!response.ok) {
      const errorText = await readDataApiError(response)
      console.error(
        `[DataTenants API] Backend returned ${response.status}: ${errorText}`
      )
      return NextResponse.json(
        { error: errorText },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (error: unknown) {
    console.error("[DataTenants API] POST Error:", error)
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create DataAPI tenant."

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
