export type CosavuApiSurface = "stan" | "data"

const DEFAULT_STAN_API_BASE_URL = "https://api.cosavu.com"
const DEFAULT_DATA_API_BASE_URL =
  process.env.NODE_ENV === "development"
    ? "http://127.0.0.1:8000"
    : "https://dataapi.cosavu.com"

function normalizeBaseUrl(value: string) {
  return value.replace(/\/+$/, "")
}

export const COSAVU_STAN_API_BASE_URL = normalizeBaseUrl(
  process.env.NEXT_PUBLIC_COSAVU_API_BASE_URL || DEFAULT_STAN_API_BASE_URL
)

export const COSAVU_DATA_API_BASE_URL = normalizeBaseUrl(
  process.env.NEXT_PUBLIC_COSAVU_DATA_API_BASE_URL || DEFAULT_DATA_API_BASE_URL
)

export function getCosavuApiUrl(surface: CosavuApiSurface, path: string) {
  const baseUrl =
    surface === "stan" ? COSAVU_STAN_API_BASE_URL : COSAVU_DATA_API_BASE_URL
  const normalizedPath = path.startsWith("/") ? path : `/${path}`

  return `${baseUrl}${normalizedPath}`
}

export const COSAVU_ENDPOINTS = {
  stan: {
    health: getCosavuApiUrl("stan", "/health"),
    optimize: getCosavuApiUrl("stan", "/optimize"),
    audit: getCosavuApiUrl("stan", "/audit"),
    auditWorkspace: getCosavuApiUrl("stan", "/audit/workspace"),
    chat: getCosavuApiUrl("stan", "/chat"),
    chatStream: getCosavuApiUrl("stan", "/chat/stream"),
    apiKeys: getCosavuApiUrl("stan", "/api-keys/"),
  },
  data: {
    health: getCosavuApiUrl("data", "/"),
    tenants: getCosavuApiUrl("data", "/v2/tenants"),
    tenantKeys: (tenantSlug: string) =>
      getCosavuApiUrl("data", `/v2/tenants/${tenantSlug}/keys`),
    query: getCosavuApiUrl("data", "/v2/query"),
    buckets: getCosavuApiUrl("data", "/v2/buckets"),
    filesUpload: getCosavuApiUrl("data", "/v2/files/upload"),
    warehouseSync: getCosavuApiUrl("data", "/v2/warehouse/{id}/sync"),
  },
} as const

const DATA_TENANT_KEYS_STORAGE_PREFIX = "cosavu:dataapi-tenant-keys"
const CONSOLE_DATA_TENANTS_ENDPOINT = "/api/data-tenants"
const DATA_TENANT_FALLBACK_STATUSES = new Set([404, 500, 502, 503, 504])
const MAX_CREATE_ATTEMPTS = 8

export type CosavuApiKeyResponse = {
  id: number | string
  user_name: string
  email: string
  enterprise_name?: string | null
  api_key: string
}

export type DataTenantInfo = {
  id: string
  name: string
  slug: string
  owner_email?: string | null
  created_at: string
}

export type DataTenantCreateResponse = {
  tenant: DataTenantInfo
  api_key: string
  api_key_id: string
}

export type DataTenantKeyRecord = {
  tenantId: string
  tenantName: string
  tenantSlug: string
  keyId: string
  apiKey: string
  createdAt: string
}

export type DataBucketInfo = {
  name: string
  system: string
  total_chunks: number
}

export type DataFileUploadResponse = {
  id: string
  filename: string
  chunks_indexed: number
}

async function readCosavuApiError(response: Response) {
  const fallback = `Cosavu request failed with ${response.status}`

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

function isNameConflict(message: string) {
  const normalized = message.toLowerCase()

  return (
    normalized.includes("409") ||
    normalized.includes("already exists") ||
    normalized.includes("already in use") ||
    normalized.includes("unique constraint")
  )
}

function withUniqueSuffix(value: string, attempt: number) {
  if (attempt === 0) return value

  const suffix =
    attempt === 1
      ? Date.now().toString(36).slice(-6)
      : `${Date.now().toString(36).slice(-4)}${Math.random()
          .toString(36)
          .slice(2, 6)}`
  const maxBaseLength = Math.max(8, 50 - suffix.length - 1)

  return `${value.slice(0, maxBaseLength).replace(/-+$/g, "")}-${suffix}`
}

function getPublicDataAdminHeaders(): Record<string, string> {
  const adminToken = process.env.NEXT_PUBLIC_COSAVU_ADMIN_TOKEN

  if (!adminToken) return {}

  return {
    "X-Admin-Token": adminToken,
  }
}

export async function createCosavuApiKey({
  userName,
  email,
  enterpriseName,
}: {
  userName: string
  email: string
  enterpriseName?: string
}) {
  const response = await fetch(COSAVU_ENDPOINTS.stan.apiKeys, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      user_name: userName,
      email,
      enterprise_name: enterpriseName || null,
    }),
  })

  if (!response.ok) {
    throw new Error(`Cosavu API key request failed with ${response.status}`)
  }

  return (await response.json()) as CosavuApiKeyResponse
}

export function getDataTenantKeysStorageKey(email?: string | null) {
  return `${DATA_TENANT_KEYS_STORAGE_PREFIX}:${email?.toLowerCase() || "unknown"}`
}

export function readLocalDataTenantKeys(email?: string | null) {
  if (typeof window === "undefined") return []

  try {
    const storedKeys = window.localStorage.getItem(
      getDataTenantKeysStorageKey(email)
    )
    if (!storedKeys) return []

    const parsedKeys = JSON.parse(storedKeys)
    if (!Array.isArray(parsedKeys)) return []

    return parsedKeys.filter((key): key is DataTenantKeyRecord => {
      return Boolean(key?.tenantSlug && key?.apiKey)
    })
  } catch {
    return []
  }
}

export function saveLocalDataTenantKey(
  email: string | null | undefined,
  keyRecord: DataTenantKeyRecord
) {
  if (typeof window === "undefined") return

  const storageKey = getDataTenantKeysStorageKey(email)
  const existingKeys = readLocalDataTenantKeys(email).filter(
    (key) => key.tenantSlug !== keyRecord.tenantSlug
  )

  window.localStorage.setItem(
    storageKey,
    JSON.stringify([keyRecord, ...existingKeys].slice(0, 50))
  )
}

export function getLatestDataTenantKey(email?: string | null) {
  return readLocalDataTenantKeys(email)[0] || null
}

export async function listDataTenants(email?: string | null) {
  let url = CONSOLE_DATA_TENANTS_ENDPOINT
  if (email) {
    url += `?email=${encodeURIComponent(email)}`
  }
  let response = await fetch(url, {
    cache: "no-store",
  })

  if (DATA_TENANT_FALLBACK_STATUSES.has(response.status)) {
    let fallbackUrl = COSAVU_ENDPOINTS.data.tenants
    if (email) {
      fallbackUrl += `?owner_email=${encodeURIComponent(email)}`
    }
    response = await fetch(fallbackUrl, {
      headers: getPublicDataAdminHeaders(),
      cache: "no-store",
    })
  }

  if (!response.ok) {
    throw new Error(await readCosavuApiError(response))
  }

  return (await response.json()) as DataTenantInfo[]
}

export async function createDataTenant({
  name,
  slug,
  keyName,
  ownerEmail,
}: {
  name: string
  slug: string
  keyName?: string
  ownerEmail?: string | null
}) {
  let lastError = "Could not create DataAPI tenant."

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const candidateSlug = withUniqueSuffix(slug, attempt)
    const tenantPayload = {
      name,
      slug: candidateSlug,
      ownerEmail: ownerEmail || null,
      keyName: keyName || "Console key",
    }
    const dataApiPayload = {
      name,
      slug: candidateSlug,
      owner_email: ownerEmail || null,
      key_name: keyName || "Console key",
    }
    let response = await fetch(CONSOLE_DATA_TENANTS_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(tenantPayload),
    })

    if (DATA_TENANT_FALLBACK_STATUSES.has(response.status)) {
      response = await fetch(COSAVU_ENDPOINTS.data.tenants, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getPublicDataAdminHeaders(),
        },
        body: JSON.stringify(dataApiPayload),
      })
    }

    if (response.ok) {
      return (await response.json()) as DataTenantCreateResponse
    }

    lastError = await readCosavuApiError(response)
    if (!isNameConflict(lastError)) {
      throw new Error(lastError)
    }
  }

  throw new Error(
    `${lastError} Tried ${MAX_CREATE_ATTEMPTS} unique tenant slugs.`
  )
}

export async function createDataBucket({
  apiKey,
  name,
  system,
}: {
  apiKey: string
  name: string
  system: string
}) {
  let lastError = "Could not create DataAPI bucket."

  for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
    const candidateName = withUniqueSuffix(name, attempt)
    const response = await fetch(COSAVU_ENDPOINTS.data.buckets, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ name: candidateName, system }),
    })

    if (response.ok) {
      return (await response.json()) as DataBucketInfo
    }

    lastError = await readCosavuApiError(response)
    if (!isNameConflict(lastError)) {
      throw new Error(lastError)
    }
  }

  throw new Error(
    `${lastError} Tried ${MAX_CREATE_ATTEMPTS} unique bucket names.`
  )
}

export async function listDataBuckets(apiKey: string) {
  const response = await fetch(COSAVU_ENDPOINTS.data.buckets, {
    headers: {
      "X-API-Key": apiKey,
    },
  })

  if (!response.ok) {
    throw new Error(await readCosavuApiError(response))
  }

  return (await response.json()) as DataBucketInfo[]
}

export async function uploadDataFile({
  apiKey,
  file,
  system,
  collection,
  chunkSize = 512,
}: {
  apiKey: string
  file: File
  system: string
  collection: string
  chunkSize?: number
}) {
  const formData = new FormData()
  formData.append("file", file)
  formData.append("system", system)
  formData.append("collection", collection)
  formData.append("chunk_size", String(chunkSize))

  const response = await fetch(COSAVU_ENDPOINTS.data.filesUpload, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
    },
    body: formData,
  })

  if (!response.ok) {
    throw new Error(await readCosavuApiError(response))
  }

  return (await response.json()) as DataFileUploadResponse
}
