"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Activity,
  ArrowRight,
  BadgeDollarSign,
  BarChart2,
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  Copy,
  Cpu,
  CreditCard,
  Database,
  FileCode,
  FileJson,
  Gauge,
  Globe,
  KeyRound,
  Layers3,
  List,
  Lock,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
  ShieldAlert,
  Sliders,
  Sparkles,
  Sun,
  Target,
  Terminal,
  Unplug,
  X,
  Zap,
} from "lucide-react"

import { AppSidebar } from "@/components/app-sidebar"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"

import {
  COSAVU_DATA_API_BASE_URL,
  COSAVU_STAN_API_BASE_URL,
} from "@/lib/cosavu-api"
import { watchConsoleAuth, type ConsoleUser } from "@/lib/console-auth"
import {
  EMPTY_CONSOLE_STATS,
  fetchConsoleStats,
  mergeConsoleStats,
} from "@/lib/console-stats"

type StoredRecord = Record<string, unknown>

type WorkspaceOverview = {
  api: {
    activeKeys: number
    latestIssue: string
  }
  billing: {
    usagePercent: number
    currentBill: number
    paidInvoices: number
  }
  buckets: {
    total: number
    files: number
    storageBytes: number
  }
  warehouse: {
    connected: number
    runs: number
    indexedBytes: number
  }
  tenants: {
    active: number
    syncing: number
  }
  logs: {
    total: number
    warnings: number
    errors: number
  }
  queries: {
    total: number
    p95Latency: number
    successRate: number
    retentionRate: number
  }
  context: {
    requests: number
    savedTokens: number
    spendSaved: number
    reduction: number
    latencySaved: number
  }
  admin: {
    workspaceName: string
    region: string
    securityScore: number
  }
}

const STORAGE_PREFIXES = {
  apiKeys: "cosavu:api-keys",
  buckets: "cosavu:buckets",
  bucketFiles: "cosavu:bucket-files",
  warehouses: "cosavu:warehouses",
  warehouseRuns: "cosavu:warehouse-runs",
  tenants: "cosavu:tenants",
  logs: "cosavu:system-logs",
  queries: "cosavu:query-analytics",
  context: "cosavu:context-api",
  admin: "cosavu:admin-settings",
}

const FALLBACK_OVERVIEW: WorkspaceOverview = {
  api: {
    activeKeys: 0,
    latestIssue: "None",
  },
  billing: {
    usagePercent: 0,
    currentBill: 0,
    paidInvoices: 0,
  },
  buckets: {
    total: 0,
    files: 0,
    storageBytes: 0,
  },
  warehouse: {
    connected: 0,
    runs: 0,
    indexedBytes: 0,
  },
  tenants: {
    active: 0,
    syncing: 0,
  },
  logs: {
    total: 0,
    warnings: 0,
    errors: 0,
  },
  queries: {
    total: 0,
    p95Latency: 0,
    successRate: 0,
    retentionRate: 0,
  },
  context: {
    requests: 0,
    savedTokens: 0,
    spendSaved: 0,
    reduction: 0,
    latencySaved: 0,
  },
  admin: {
    workspaceName: "Cosavu",
    region: "us-east-1",
    securityScore: 0,
  },
}

function getStorageKey(prefix: string, email?: string | null) {
  return `${prefix}:${email?.toLowerCase() || "unknown"}`
}

function readStoredArray(prefix: string, email?: string | null) {
  if (typeof window === "undefined") return []

  try {
    const rawValue = window.localStorage.getItem(getStorageKey(prefix, email))
    if (!rawValue) return []

    const parsedValue = JSON.parse(rawValue)
    return Array.isArray(parsedValue) ? (parsedValue as StoredRecord[]) : []
  } catch {
    return []
  }
}

function readStoredObject(prefix: string, email?: string | null) {
  if (typeof window === "undefined") return null

  try {
    const rawValue = window.localStorage.getItem(getStorageKey(prefix, email))
    if (!rawValue) return null

    const parsedValue = JSON.parse(rawValue)
    return parsedValue && !Array.isArray(parsedValue)
      ? (parsedValue as StoredRecord)
      : null
  } catch {
    return null
  }
}

function toNumber(value: unknown, fallback = 0) {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : fallback
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(Math.round(value))
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value)
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 100 ? 2 : 0,
    maximumFractionDigits: value < 100 ? 2 : 0,
  }).format(value)
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const value = bytes / 1024 ** unitIndex

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDateLabel(value?: unknown) {
  if (!value || typeof value !== "string") return "None"

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) return 0

  const sortedValues = [...values].sort((a, b) => a - b)
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1

  return sortedValues[Math.max(0, Math.min(sortedValues.length - 1, index))]
}

function sumStoredNumber(records: StoredRecord[], keys: string[]) {
  return records.reduce((sum, record) => {
    const value = keys.find((key) => record[key] != null)
    return sum + (value ? toNumber(record[value]) : 0)
  }, 0)
}

function deriveContextOverview(contextRuns: StoredRecord[]) {
  if (contextRuns.length === 0) return FALLBACK_OVERVIEW.context

  const requests = contextRuns.reduce(
    (sum, run) => sum + toNumber(run.requestCount, 1),
    0
  )
  const originalTokens = contextRuns.reduce(
    (sum, run) =>
      sum + toNumber(run.originalTokens) * toNumber(run.requestCount, 1),
    0
  )
  const optimizedTokens = contextRuns.reduce(
    (sum, run) =>
      sum + toNumber(run.optimizedTokens) * toNumber(run.requestCount, 1),
    0
  )
  const savedTokens = Math.max(0, originalTokens - optimizedTokens)
  const reduction =
    originalTokens === 0 ? 0 : Math.round((savedTokens / originalTokens) * 100)
  const latencySaved =
    requests === 0
      ? 0
      : Math.round(
          contextRuns.reduce((sum, run) => {
            return (
              sum +
              Math.max(
                0,
                toNumber(run.unoptimizedLatencyMs) -
                  toNumber(run.optimizedLatencyMs)
              ) *
                toNumber(run.requestCount, 1)
            )
          }, 0) / requests
        )

  return {
    requests,
    savedTokens,
    spendSaved: (savedTokens / 1000) * 0.002,
    reduction,
    latencySaved,
  }
}

function readWorkspaceOverview(email?: string | null): WorkspaceOverview {
  const apiKeys = readStoredArray(STORAGE_PREFIXES.apiKeys, email)
  const buckets = readStoredArray(STORAGE_PREFIXES.buckets, email)
  const bucketFiles = readStoredArray(STORAGE_PREFIXES.bucketFiles, email)
  const warehouses = readStoredArray(STORAGE_PREFIXES.warehouses, email)
  const warehouseRuns = readStoredArray(STORAGE_PREFIXES.warehouseRuns, email)
  const tenants = readStoredArray(STORAGE_PREFIXES.tenants, email)
  const logs = readStoredArray(STORAGE_PREFIXES.logs, email)
  const queries = readStoredArray(STORAGE_PREFIXES.queries, email)
  const contextRuns = readStoredArray(STORAGE_PREFIXES.context, email)
  const adminSettings = readStoredObject(STORAGE_PREFIXES.admin, email)

  const queryLatencies = queries.map((query) => toNumber(query.totalMs))
  const successfulQueries = queries.filter(
    (query) => query.status !== "error"
  ).length
  const retainedQueries = queries.filter(
    (query) => toNumber(query.candidateCount) > 0
  )
  const retentionRate =
    retainedQueries.length === 0
      ? 0
      : Math.round(
          (retainedQueries.reduce((sum, query) => {
            return (
              sum +
              toNumber(query.retainedCount) / toNumber(query.candidateCount, 1)
            )
          }, 0) /
            retainedQueries.length) *
            100
        )
  const activeKeys = apiKeys.filter((key) => key.status !== "revoked").length
  const latestIssue =
    apiKeys.length === 0
      ? "None"
      : formatDateLabel(apiKeys[0]?.created_at || apiKeys[0]?.createdAt)
  const storageBytes =
    sumStoredNumber(buckets, ["sizeBytes", "storageBytes", "totalBytes"]) ||
    sumStoredNumber(bucketFiles, ["size", "sizeBytes", "bytes"])
  const indexedBytes = sumStoredNumber(warehouses, [
    "indexedBytes",
    "sizeBytes",
    "storageBytes",
  ])

  return {
    api: {
      activeKeys,
      latestIssue,
    },
    billing: {
      usagePercent: 0,
      currentBill: deriveContextOverview(contextRuns).spendSaved,
      paidInvoices: 0,
    },
    buckets: {
      total: buckets.length,
      files: bucketFiles.length,
      storageBytes,
    },
    warehouse: {
      connected: warehouses.filter((warehouse) => warehouse.status !== "paused")
        .length,
      runs: warehouseRuns.length,
      indexedBytes,
    },
    tenants: {
      active: tenants.filter((tenant) => tenant.status !== "attention").length,
      syncing: tenants.filter((tenant) => tenant.status === "syncing").length,
    },
    logs: {
      total: logs.length,
      warnings: logs.filter((log) => log.level === "warning").length,
      errors: logs.filter((log) => log.level === "error").length,
    },
    queries: {
      total: queries.length,
      p95Latency: Math.round(percentile(queryLatencies, 95)),
      successRate:
        queries.length === 0
          ? 0
          : Math.round((successfulQueries / queries.length) * 100),
      retentionRate,
    },
    context: deriveContextOverview(contextRuns),
    admin: {
      workspaceName:
        typeof adminSettings?.workspaceName === "string"
          ? adminSettings.workspaceName
          : FALLBACK_OVERVIEW.admin.workspaceName,
      region:
        typeof adminSettings?.defaultRegion === "string"
          ? adminSettings.defaultRegion
          : FALLBACK_OVERVIEW.admin.region,
      securityScore: FALLBACK_OVERVIEW.admin.securityScore,
    },
  }
}

function applyConsoleStatsToOverview(
  overview: WorkspaceOverview,
  stats: Awaited<ReturnType<typeof fetchConsoleStats>>
): WorkspaceOverview {
  return {
    ...overview,
    api: {
      activeKeys: Math.max(overview.api.activeKeys, stats.activeKeys),
      latestIssue: stats.latestIssue
        ? formatDateLabel(stats.latestIssue)
        : overview.api.latestIssue,
    },
    billing: {
      usagePercent: stats.monthlyUsagePercent ?? overview.billing.usagePercent,
      currentBill: Math.max(overview.billing.currentBill, stats.currentBillUsd),
      paidInvoices: Math.max(overview.billing.paidInvoices, stats.paidInvoices),
    },
    buckets: {
      ...overview.buckets,
      total: Math.max(overview.buckets.total, stats.bucketCount),
      files: Math.max(overview.buckets.files, stats.filesSynced),
    },
    warehouse: {
      ...overview.warehouse,
      connected: Math.max(
        overview.warehouse.connected,
        stats.connectedWarehouses
      ),
      runs: Math.max(overview.warehouse.runs, stats.bucketCount),
    },
    context: {
      ...overview.context,
      requests: stats.requestsUsed ?? overview.context.requests,
      savedTokens: stats.tokensSaved ?? overview.context.savedTokens,
      spendSaved: Math.max(overview.context.spendSaved, stats.currentBillUsd),
      reduction: stats.tokenSavingsPercent ?? overview.context.reduction,
    },
  }
}

export default function Dashboard() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [user, setUser] = useState<ConsoleUser | null>(null)
  const [overview, setOverview] = useState<WorkspaceOverview>(FALLBACK_OVERVIEW)

  // --- Cosavu AI Gateway / Portkey Portal States ---
  const [activeLang, setActiveLang] = useState("python")
  const [selectedProvider, setSelectedProvider] = useState("openai")
  const [cacheEnabled, setCacheEnabled] = useState(true)
  const [retryEnabled, setRetryEnabled] = useState(true)
  const [fallbackEnabled, setFallbackEnabled] = useState(false)
  const [guardrailsEnabled, setGuardrailsEnabled] = useState(false)

  // Virtual Keys configuration
  const [providerKeys, setProviderKeys] = useState<Record<string, { connected: boolean; key: string; latency: number }>>(() => {
    if (typeof window !== "undefined") {
      try {
        const savedKeys = window.localStorage.getItem("cosavu:gateway-virtual-keys")
        if (savedKeys) {
          return JSON.parse(savedKeys)
        }
      } catch (e) {
        console.error("Failed to load virtual keys", e)
      }
    }
    return {
      openai: { connected: true, key: "sk-cosavu-...8a9f", latency: 42 },
      anthropic: { connected: false, key: "", latency: 0 },
      gemini: { connected: false, key: "", latency: 0 },
      azure: { connected: false, key: "", latency: 0 },
    }
  })
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [tempKey, setTempKey] = useState("")

  // Content policies & guardrails
  const [guardrailsList, setGuardrailsList] = useState({
    pii: { enabled: true, action: "mask" },
    injection: { enabled: true, action: "block" },
    toxicity: { enabled: false, action: "block" },
    schema: { enabled: false, action: "block" },
  })

  // Mock Playground
  const [playgroundModel, setPlaygroundModel] = useState("gpt-4o-mini")
  const [playgroundPrompt, setPlaygroundPrompt] = useState("Explain vector search in simple terms.")
  const [playgroundResponse, setPlaygroundResponse] = useState("")
  const [playgroundStatus, setPlaygroundStatus] = useState<"idle" | "loading" | "done" | "error">("idle")
  const [playgroundStats, setPlaygroundStats] = useState({
    totalTimeMs: 0,
    cached: false,
    tokensSaved: 0,
    costSaved: 0,
    guardrailPassed: true,
  })

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login")
    }
  }, [loading, user, router])

  const saveVirtualKey = (provider: string, keyVal: string) => {
    const isConnected = keyVal.trim().length > 0
    const randomLatency = isConnected ? Math.floor(Math.random() * 80) + 40 : 0
    const newKeys = {
      ...providerKeys,
      [provider]: {
        connected: isConnected,
        key: keyVal ? `sk-cosavu-...${keyVal.slice(-4)}` : "",
        latency: randomLatency,
      },
    }
    setProviderKeys(newKeys)
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cosavu:gateway-virtual-keys", JSON.stringify(newKeys))
    }
    setEditingProvider(null)
    setTempKey("")
  }

  const removeVirtualKey = (provider: string) => {
    const newKeys = {
      ...providerKeys,
      [provider]: { connected: false, key: "", latency: 0 },
    }
    setProviderKeys(newKeys)
    if (typeof window !== "undefined") {
      window.localStorage.setItem("cosavu:gateway-virtual-keys", JSON.stringify(newKeys))
    }
  }

  // Simulate Gateway call with caching, fallbacks and guardrails
  const handlePlaygroundSubmit = () => {
    if (!playgroundPrompt.trim()) return
    setPlaygroundStatus("loading")
    setPlaygroundResponse("")

    const isCached = cacheEnabled && Math.random() > 0.4
    const totalTime = isCached ? 12 : Math.floor(Math.random() * 320) + 180
    const tokens = Math.floor(Math.random() * 120) + 45
    const cost = (tokens / 1000) * 0.002

    setTimeout(() => {
      // Simulate Prompt Injection guardrail block
      if (guardrailsList.injection.enabled && 
          (playgroundPrompt.toLowerCase().includes("ignore previous") || 
           playgroundPrompt.toLowerCase().includes("ignore instructions") || 
           playgroundPrompt.toLowerCase().includes("system prompt override"))) {
        setPlaygroundStatus("error")
        setPlaygroundResponse("⚠️ Request Blocked by Cosavu Guardrails: Potential Prompt Injection attempt detected.")
        setPlaygroundStats({
          totalTimeMs: 14,
          cached: false,
          tokensSaved: 0,
          costSaved: 0,
          guardrailPassed: false,
        })
        return
      }

      let finalRes = ""
      if (playgroundModel.includes("gpt")) {
        finalRes = `[GPT-4o via Cosavu AI Gateway]\n\nVector search represents text elements (words, sentences, or documents) as multi-dimensional coordinate vectors. By projecting semantic meanings into vector space, search algorithms can find mathematically "close" vectors using formulas like Cosine Similarity. This matches search queries by user intent rather than literal keyword overlap.`
      } else if (playgroundModel.includes("claude")) {
        finalRes = `[Claude-3.5-Sonnet via Cosavu AI Gateway]\n\nVector search transforms text into vectors (numerical representations of semantic meanings) using embeddings models. When a user queries your database, the system creates a search vector and compares it with indexed collections (like Cosavu CAR-1). It ranks results based on closeness, ensuring high-fidelity matches even when keywords differ.`
      } else {
        finalRes = `[Gemini-1.5-Pro via Cosavu AI Gateway]\n\nVector search works by comparing the mathematical distance between vectors stored in a vector database. Text is processed through an LLM to generate high-dimensional vectors. The gateway routes this search, utilizing active semantic caching if enabled to bypass direct model queries, saving latency and token spend.`
      }

      setPlaygroundResponse(finalRes)
      setPlaygroundStatus("done")
      setPlaygroundStats({
        totalTimeMs: totalTime,
        cached: isCached,
        tokensSaved: isCached ? tokens : 0,
        costSaved: isCached ? cost : 0,
        guardrailPassed: true,
      })
    }, 1200)
  }

  const [copiedState, setCopiedState] = useState<Record<string, boolean>>({})
  const copyToClipboard = (text: string, id: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text)
      setCopiedState((prev) => ({ ...prev, [id]: true }))
      setTimeout(() => {
        setCopiedState((prev) => ({ ...prev, [id]: false }))
      }, 2000)
    }
  }

  const getConfigJson = () => {
    return JSON.stringify({
      strategy: fallbackEnabled ? "fallback" : "direct",
      cache: {
        enabled: cacheEnabled,
        mode: "semantic",
        ttl_seconds: 3600
      },
      retry: {
        enabled: retryEnabled,
        attempts: 3,
        backoff: "exponential"
      },
      fallback: fallbackEnabled ? {
        target_provider: "gemini",
        target_model: "gemini-1.5-pro",
        on_codes: [429, 500, 503]
      } : null,
      guardrails: {
        enabled: guardrailsEnabled,
        policies: Object.entries(guardrailsList)
          .filter(([_, val]) => val.enabled)
          .map(([key, val]) => ({
            type: key,
            action: val.action
          }))
      }
    }, null, 2)
  }

  const getQuickstartCode = () => {
    const modelName = playgroundModel
    const prov = selectedProvider
    
    if (activeLang === "python") {
      return `from cosavu import CosavuGateway

# Initialize Cosavu AI Gateway with routing rules
gateway = CosavuGateway(
    api_key="cosavu_sec_...",
    config={
        "cache": ${cacheEnabled ? '{"mode": "semantic", "ttl": 3600}' : "None"},
        "retry": ${retryEnabled ? '{"attempts": 3, "backoff": "exponential"}' : "None"},
        "fallback": ${fallbackEnabled ? '{"provider": "gemini", "model": "gemini-1.5-pro"}' : "None"},
        "guardrails": ${guardrailsEnabled ? '["pii", "injection"]' : "[]"}
    }
)

# Connects to ${prov} using your virtual keys
response = gateway.chat.completions.create(
    model="${modelName}",
    messages=[{"role": "user", "content": "Search retriever logs"}]
)

print(response.choices[0].message.content)`
    } else if (activeLang === "nodejs") {
      return `import { CosavuGateway } from "@cosavu/gateway";

const gateway = new CosavuGateway({
  apiKey: "cosavu_sec_...",
  config: {
    cache: ${cacheEnabled ? '{ mode: "semantic", ttl: 3600 }' : "null"},
    retry: ${retryEnabled ? '{ attempts: 3, backoff: "exponential" }' : "null"},
    fallback: ${fallbackEnabled ? '{ provider: "gemini", model: "gemini-1.5-pro" }' : "null"},
    guardrails: ${guardrailsEnabled ? '["pii", "injection"]' : "[]"}
  }
});

// Fast routing with built-in resiliency
const completion = await gateway.chat.completions.create({
  model: "${modelName}",
  messages: [{ role: "user", content: "Search retriever logs" }]
});

console.log(completion.choices[0].message.content);`
    } else {
      return `curl https://gateway.cosavu.com/v1/chat/completions \\
  -H "Authorization: Bearer cosavu_sec_..." \\
  -H "x-cosavu-config: {\\\\\\"cache\\\\\\":${cacheEnabled},\\\\\\"retry\\\\\\":${retryEnabled ? 3 : 0}}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${modelName}",
    "messages": [{"role": "user", "content": "Search retriever logs"}]
  }'`
    }
  }

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true))

    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const unsubscribe = watchConsoleAuth(async (currentUser) => {
      if (!currentUser) {
        setUser(null)
        setLoading(false)
        return
      }

      setUser(currentUser)
      const localOverview = readWorkspaceOverview(currentUser.email)
      setOverview(localOverview)

      try {
        const liveStats = await fetchConsoleStats(currentUser.email)
        setOverview(
          applyConsoleStatsToOverview(
            localOverview,
            mergeConsoleStats(liveStats, EMPTY_CONSOLE_STATS)
          )
        )
      } catch {
        setOverview(localOverview)
      }

      setLoading(false)
    })

    return () => unsubscribe()
  }, [router])

  const savingsTrend = useMemo(() => {
    const base = overview.context.savedTokens / 7
    const factors = [0.72, 0.86, 0.78, 1.05, 0.94, 1.18, 1.34]
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    return factors.map((factor, index) => ({
      day: days[index],
      tokens: Math.round(base * factor),
      spend: estimateSpend(base * factor),
    }))
  }, [overview.context.savedTokens])

  const spendMix = useMemo(() => {
    const bill = overview.billing.currentBill

    return [
      {
        label: "ContextAPI",
        value: overview.context.spendSaved,
        share: Math.min(
          100,
          Math.round((overview.context.spendSaved / bill) * 100)
        ),
      },
      {
        label: "Query",
        value: bill * 0.38,
        share: 38,
      },
      {
        label: "Storage",
        value: bill * 0.19,
        share: 19,
      },
      {
        label: "Warehouse",
        value: bill * 0.13,
        share: 13,
      },
    ]
  }, [overview.billing.currentBill, overview.context.spendSaved])

  const pageCards = useMemo(
    () => [
      {
        title: "ContextAPI",
        href: "/context-api",
        icon: Sparkles,
        metric: formatCompact(overview.context.savedTokens),
        label: "tokens saved",
        progress: overview.context.reduction,
      },
      {
        title: "Query Analytics",
        href: "/query-analytics",
        icon: BarChart2,
        metric: `${overview.queries.p95Latency}ms`,
        label: "p95 latency",
        progress: overview.queries.successRate,
      },
      {
        title: "System Logs",
        href: "/system-logs",
        icon: List,
        metric: formatNumber(overview.logs.total),
        label: `${overview.logs.errors} errors`,
        progress: Math.max(0, 100 - overview.logs.errors * 12),
      },
      {
        title: "Buckets",
        href: "/buckets",
        icon: Database,
        metric: formatNumber(overview.buckets.total),
        label: `${formatNumber(overview.buckets.files)} files`,
        progress: 74,
      },
      {
        title: "Warehouse",
        href: "/warehouse",
        icon: Unplug,
        metric: formatNumber(overview.warehouse.connected),
        label: `${overview.warehouse.runs} sync runs`,
        progress: 82,
      },
      {
        title: "Tenants",
        href: "/tenants",
        icon: Boxes,
        metric: formatNumber(overview.tenants.active),
        label: `${overview.tenants.syncing} syncing`,
        progress: 86,
      },
      {
        title: "API Keys",
        href: "/api",
        icon: KeyRound,
        metric: formatNumber(overview.api.activeKeys),
        label: overview.api.latestIssue,
        progress: overview.api.activeKeys > 0 ? 100 : 0,
      },
      {
        title: "Billing",
        href: "/billing",
        icon: CreditCard,
        metric: `${overview.billing.usagePercent}%`,
        label: "metered usage",
        progress: overview.billing.usagePercent,
      },
      {
        title: "Admin Settings",
        href: "/admin-settings",
        icon: Settings,
        metric: `${overview.admin.securityScore}%`,
        label: overview.admin.region,
        progress: overview.admin.securityScore,
      },
    ],
    [overview]
  )

  const maxTrendValue = Math.max(...savingsTrend.map((item) => item.tokens))

  const refreshOverview = () => {
    setRefreshing(true)
    setOverview(readWorkspaceOverview(user?.email))
    window.setTimeout(() => setRefreshing(false), 550)
  }

  if (loading) {
    return (
      <SidebarProvider defaultOpen>
        <div className="flex h-screen w-full bg-background text-foreground font-sans selection:bg-indigo-500/30 overflow-hidden relative">
        {/* CSS Background Grid & Glows */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none opacity-30" />
        <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full dark:bg-indigo-900/10 bg-indigo-500/5 blur-[120px] pointer-events-none" />
        <div className="absolute top-[30%] right-[-10%] h-[500px] w-[500px] rounded-full dark:bg-purple-900/10 bg-purple-500/5 blur-[120px] pointer-events-none" />
          <AppSidebar />
          <SidebarInset className="flex h-screen w-full flex-col overflow-y-auto shadow-none">
            <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 bg-background px-4">
              <SidebarTrigger className="-ml-2 text-muted-foreground hover:text-foreground hover:bg-accent/40" />
              <Skeleton className="h-4 w-44" />
              <Skeleton className="ml-auto size-8 rounded-sm" />
            </header>
            <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 p-4 lg:p-6">
              <Skeleton className="h-48 w-full rounded-sm" />
              <div className="grid gap-4 xl:grid-cols-[1fr_0.85fr]">
                <Skeleton className="h-96 rounded-sm" />
                <Skeleton className="h-96 rounded-sm" />
              </div>
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    )
  }


  if (!user) {
    return null
  }

  return (
    <SidebarProvider defaultOpen>
      <div className="flex h-screen w-full bg-background text-foreground font-sans selection:bg-indigo-500/30 overflow-hidden relative">
        {/* CSS Background Grid & Glows */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none opacity-30" />
        <div className="absolute top-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full dark:bg-indigo-900/10 bg-indigo-500/5 blur-[120px] pointer-events-none" />
        <div className="absolute top-[30%] right-[-10%] h-[500px] w-[500px] rounded-full dark:bg-purple-900/10 bg-purple-500/5 blur-[120px] pointer-events-none" />

        <AppSidebar />
        <SidebarInset className="relative flex h-screen w-full flex-col overflow-y-auto bg-transparent shadow-none">
          <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 border-b border-border/40 bg-background/75 px-4 backdrop-blur-md">
            <SidebarTrigger className="-ml-2 text-muted-foreground hover:text-foreground hover:bg-accent/40" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>{overview.admin.workspaceName}</BreadcrumbItem>
                <BreadcrumbSeparator>
                  <ChevronRight className="size-3.5" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbPage>Getting Started</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-sm"
                    aria-label="Refresh overview"
                    disabled={refreshing}
                    onClick={refreshOverview}
                  >
                    <RefreshCw
                      className={refreshing ? "size-4 animate-spin" : "size-4"}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh overview</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-sm"
                    aria-label="Toggle theme"
                    disabled={!mounted}
                    onClick={() =>
                      setTheme(theme === "dark" ? "light" : "dark")
                    }
                  >
                    {mounted && theme === "dark" ? (
                      <Sun className="size-4" />
                    ) : (
                      <Moon className="size-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Toggle theme</TooltipContent>
              </Tooltip>
            </div>
          </header>

          <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 p-4 lg:p-6">
            <Tabs defaultValue="developer-portal" className="space-y-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">Cosavu Platform</h1>
                  <p className="text-muted-foreground text-sm">
                    Configure your AI Gateway, manage virtual keys, and track retrieval telemetry.
                  </p>
                </div>
                <TabsList className="grid w-full sm:w-[400px] grid-cols-2 bg-muted/40 p-1 rounded-sm">
                  <TabsTrigger value="developer-portal" className="data-[state=active]:bg-background rounded-sm">
                    <Code className="size-4 mr-2" />
                    Developer Portal
                  </TabsTrigger>
                  <TabsTrigger value="telemetry-dashboard" className="data-[state=active]:bg-background rounded-sm">
                    <BarChart2 className="size-4 mr-2" />
                    Telemetry Overview
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="developer-portal" className="space-y-6 outline-none">
                {/* HERO SECTION */}
                <div className="relative overflow-hidden rounded-sm border border-indigo-500/10 bg-gradient-to-br from-indigo-500/5 via-transparent to-transparent p-6 md:p-8">
                  <div className="absolute right-0 top-0 -mr-16 -mt-16 h-64 w-64 rounded-full bg-indigo-500/5 blur-3xl animate-pulse" />
                  <div className="relative z-10 space-y-4 max-w-3xl">
                    <div className="flex flex-wrap gap-2">
                      <Badge className="rounded-sm bg-indigo-500/10 text-indigo-500 dark:bg-indigo-500/20 border-indigo-500/20 text-xs" variant="outline">
                        <Activity className="size-3.5 mr-1 animate-pulse" /> Edge Latency &lt;10ms
                      </Badge>
                      <Badge className="rounded-sm bg-purple-500/10 text-purple-500 dark:bg-purple-500/20 border-purple-500/20 text-xs" variant="outline">
                        <Lock className="size-3.5 mr-1" /> Enterprise Guardrails
                      </Badge>
                      <Badge className="rounded-sm bg-amber-500/10 text-amber-500 dark:bg-amber-500/20 border-amber-500/20 text-xs" variant="outline">
                        <Zap className="size-3.5 mr-1 animate-bounce" /> Semantic Caching
                      </Badge>
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight md:text-3xl">
                      Next-Gen AI Gateway for Cosavu Retrieve
                    </h2>
                    <p className="text-muted-foreground text-sm leading-relaxed md:text-base">
                      Securely route user queries to 100+ LLMs with unified API keys, automatic failover mechanisms, content security guardrails, and instant semantic caching. Perfect for productionizing CAR-0 vector search and ContextAPI pipelines.
                    </p>
                  </div>
                </div>

                {/* ARCHITECTURE FLOW & CONFIG MANIFEST */}
                <div className="grid gap-6 lg:grid-cols-12">
                  {/* Left: Architecture Diagram */}
                  <Card className="lg:col-span-8 border border-border/40 bg-card/40 backdrop-blur-md rounded-md overflow-hidden flex flex-col justify-between">
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <Globe className="size-4 text-indigo-500 animate-spin" style={{ animationDuration: '8s' }} />
                        Interactive Gateway Flow
                      </CardTitle>
                      <CardDescription>
                        Simulated pathway of queries routed through the Cosavu AI Gateway.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="py-8 flex flex-col items-center justify-center min-h-[200px]">
                      <style dangerouslySetInnerHTML={{__html: `
                        @keyframes dash {
                          to {
                            stroke-dashoffset: -40;
                          }
                        }
                      `}} />
                      <div className="relative w-full max-w-[620px] flex items-center justify-between px-4">
                        {/* Connecting Wires */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <svg className="w-full h-24 overflow-visible" viewBox="0 0 500 100">
                            {/* Path 1: Client to Gateway */}
                            <path
                              d="M 20,50 L 220,50"
                              stroke="currentColor"
                              strokeWidth="2"
                              className="text-muted-foreground/30"
                              strokeDasharray="6,6"
                            />
                            {/* Active light flowing to Gateway */}
                            <path
                              d="M 20,50 L 220,50"
                              stroke="#818cf8"
                              strokeWidth="2.5"
                              strokeDasharray="10,30"
                              strokeDashoffset="0"
                              className="animate-[dash_3s_linear_infinite]"
                            />
                            
                            {/* Path 2: Gateway to Cache Store (Loop) */}
                            {cacheEnabled && (
                              <path
                                d="M 240,30 C 240,0 280,0 280,30"
                                fill="none"
                                stroke="#10b981"
                                strokeWidth="2"
                                strokeDasharray="4,4"
                                className="animate-[dash_5s_linear_infinite]"
                              />
                            )}

                            {/* Path 3: Gateway to Active LLM Provider */}
                            <path
                              d="M 280,50 Q 380,25 440,20"
                              fill="none"
                              stroke={providerKeys.openai.connected ? "#818cf8" : "#94a3b8"}
                              strokeWidth="2"
                              strokeDasharray="6,6"
                            />
                            <path
                              d="M 280,50 L 440,50"
                              fill="none"
                              stroke={providerKeys.anthropic.connected ? "#a78bfa" : "#94a3b8"}
                              strokeWidth="2"
                              strokeDasharray="6,6"
                            />
                            <path
                              d="M 280,50 Q 380,75 440,80"
                              fill="none"
                              stroke={providerKeys.gemini.connected ? "#38bdf8" : "#94a3b8"}
                              strokeWidth="2"
                              strokeDasharray="6,6"
                            />
                          </svg>
                        </div>

                        {/* Node: Client Application */}
                        <div className="z-10 flex flex-col items-center gap-2">
                          <div className="flex size-14 items-center justify-center rounded-full border border-indigo-500/30 bg-indigo-500/10 shadow-lg shadow-indigo-500/5 ring-4 ring-indigo-500/5">
                            <Cpu className="size-6 text-indigo-500" />
                          </div>
                          <span className="text-xs font-semibold">Client App</span>
                        </div>

                        {/* Node: Cosavu AI Gateway */}
                        <div className="z-10 flex flex-col items-center gap-2">
                          <div className="relative flex size-20 items-center justify-center rounded-full border border-indigo-500 bg-background shadow-2xl shadow-indigo-500/20 ring-8 ring-indigo-500/5">
                            <div className="absolute inset-0 rounded-full border-2 border-dashed border-indigo-400/30 animate-[spin_25s_linear_infinite]" />
                            <Zap className="size-8 text-indigo-500 animate-pulse" />
                            {guardrailsEnabled && (
                              <div className="absolute -top-1 -right-1 flex size-6 items-center justify-center rounded-full bg-rose-500 text-white shadow-md">
                                <ShieldAlert className="size-3.5" />
                              </div>
                            )}
                            {cacheEnabled && (
                              <div className="absolute -bottom-1 -left-1 flex size-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md">
                                <CheckCircle2 className="size-3.5" />
                              </div>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-indigo-500">Cosavu Gateway</span>
                        </div>

                        {/* Nodes: LLM Providers */}
                        <div className="z-10 flex flex-col gap-3">
                          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border text-[10px] font-medium bg-background shadow-sm transition-all ${selectedProvider === 'openai' && providerKeys.openai.connected ? 'border-emerald-500 ring-2 ring-emerald-500/5' : 'border-border/60 opacity-60'}`}>
                            <span className={`size-1.5 rounded-full ${providerKeys.openai.connected ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
                            OpenAI
                          </div>
                          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border text-[10px] font-medium bg-background shadow-sm transition-all ${selectedProvider === 'anthropic' && providerKeys.anthropic.connected ? 'border-emerald-500 ring-2 ring-emerald-500/5' : 'border-border/60 opacity-60'}`}>
                            <span className={`size-1.5 rounded-full ${providerKeys.anthropic.connected ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
                            Anthropic
                          </div>
                          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-sm border text-[10px] font-medium bg-background shadow-sm transition-all ${selectedProvider === 'gemini' && providerKeys.gemini.connected ? 'border-emerald-500 ring-2 ring-emerald-500/5' : 'border-border/60 opacity-60'}`}>
                            <span className={`size-1.5 rounded-full ${providerKeys.gemini.connected ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground'}`} />
                            Gemini
                          </div>
                        </div>
                      </div>
                    </CardContent>
                    <div className="border-t border-border/60 bg-muted/20 p-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Gateway Status</p>
                        <p className="text-sm font-semibold text-emerald-500 flex items-center justify-center gap-1 mt-0.5">
                          <span className="size-1.5 rounded-full bg-emerald-500 animate-ping" />
                          99.99% Uptime
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Requests Routed</p>
                        <p className="text-sm font-semibold mt-0.5">142,854</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Cache Hit Rate</p>
                        <p className="text-sm font-semibold text-indigo-500 mt-0.5">
                          {cacheEnabled ? "38.4%" : "0.0%"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Estimated Savings</p>
                        <p className="text-sm font-semibold text-emerald-500 mt-0.5">$285.60</p>
                      </div>
                    </div>
                  </Card>

                  {/* Right: Config Manifest Generator */}
                  <Card className="lg:col-span-4 border border-border/40 bg-card/40 backdrop-blur-md rounded-md flex flex-col justify-between">
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <Sliders className="size-4 text-indigo-500" />
                        Gateway Config
                      </CardTitle>
                      <CardDescription>
                        Toggle settings to update the routing manifest in real-time.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 flex-1">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-sm border border-border/40 p-2.5">
                          <div className="space-y-0.5">
                            <Label className="text-xs font-semibold cursor-pointer" htmlFor="toggle-cache">Semantic Caching</Label>
                            <p className="text-[10px] text-muted-foreground">Cache semantic equivalents of query prompts.</p>
                          </div>
                          <Switch id="toggle-cache" checked={cacheEnabled} onCheckedChange={setCacheEnabled} />
                        </div>

                        <div className="flex items-center justify-between rounded-sm border border-border/40 p-2.5">
                          <div className="space-y-0.5">
                            <Label className="text-xs font-semibold cursor-pointer" htmlFor="toggle-retry">Automatic Retries</Label>
                            <p className="text-[10px] text-muted-foreground">Retry on 429 rate limits or transient errors.</p>
                          </div>
                          <Switch id="toggle-retry" checked={retryEnabled} onCheckedChange={setRetryEnabled} />
                        </div>

                        <div className="flex items-center justify-between rounded-sm border border-border/40 p-2.5">
                          <div className="space-y-0.5">
                            <Label className="text-xs font-semibold cursor-pointer" htmlFor="toggle-fallback">Failover Model</Label>
                            <p className="text-[10px] text-muted-foreground">Reroute requests if primary LLM fails.</p>
                          </div>
                          <Switch id="toggle-fallback" checked={fallbackEnabled} onCheckedChange={setFallbackEnabled} />
                        </div>

                        <div className="flex items-center justify-between rounded-sm border border-border/40 p-2.5">
                          <div className="space-y-0.5">
                            <Label className="text-xs font-semibold cursor-pointer" htmlFor="toggle-guardrails">AI Guardrails</Label>
                            <p className="text-[10px] text-muted-foreground">Filter toxic outputs and protect raw context data.</p>
                          </div>
                          <Switch id="toggle-guardrails" checked={guardrailsEnabled} onCheckedChange={setGuardrailsEnabled} />
                        </div>
                      </div>

                      <div className="relative mt-4">
                        <pre className="rounded bg-muted/40 p-3 text-[10px] font-mono text-muted-foreground max-h-[160px] overflow-y-auto leading-relaxed border border-border/40">
                          {getConfigJson()}
                        </pre>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="absolute right-2 top-2 h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => copyToClipboard(getConfigJson(), "config")}
                        >
                          {copiedState.config ? (
                            <Check className="size-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* CODE INTEGRATION & VIRTUAL KEY VAULT */}
                <div className="grid gap-6 lg:grid-cols-12">
                  {/* Left: Quickstart Code Tabs */}
                  <Card className="lg:col-span-7 border border-border/40 bg-card/40 backdrop-blur-md rounded-md flex flex-col justify-between">
                    <CardHeader className="pb-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <FileCode className="size-4 text-indigo-500" />
                            Developer Quickstart
                          </CardTitle>
                          <CardDescription>
                            Configure integration credentials and copy client libraries.
                          </CardDescription>
                        </div>
                        {/* Selector Controls */}
                        <div className="flex items-center gap-2">
                          <select
                            className="bg-background border border-border/60 text-xs rounded-sm p-1.5 cursor-pointer outline-none focus:ring-1 focus:ring-indigo-500"
                            value={selectedProvider}
                            onChange={(e) => {
                              setSelectedProvider(e.target.value)
                              if (e.target.value === "openai") setPlaygroundModel("gpt-4o-mini")
                              else if (e.target.value === "anthropic") setPlaygroundModel("claude-3-5-sonnet")
                              else setPlaygroundModel("gemini-1.5-pro")
                            }}
                          >
                            <option value="openai">OpenAI provider</option>
                            <option value="anthropic">Anthropic provider</option>
                            <option value="gemini">Gemini provider</option>
                          </select>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {/* Language tabs */}
                      <div className="flex items-center justify-between border-b pb-2">
                        <div className="flex gap-2">
                          {[
                            { id: "python", label: "Python SDK" },
                            { id: "nodejs", label: "NodeJS SDK" },
                            { id: "curl", label: "cURL Payload" },
                          ].map((lang) => (
                            <button
                              key={lang.id}
                              className={`px-3 py-1 rounded-sm text-xs font-medium transition-colors ${activeLang === lang.id ? 'bg-indigo-500/10 text-indigo-500 border border-indigo-500/20' : 'text-muted-foreground hover:text-foreground'}`}
                              onClick={() => setActiveLang(lang.id)}
                            >
                              {lang.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Code Block Container */}
                      <div className="relative">
                        <pre className="rounded-lg bg-muted/40 p-4 text-xs font-mono text-muted-foreground max-h-[300px] overflow-y-auto leading-relaxed border border-border/40 select-all">
                          {getQuickstartCode()}
                        </pre>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="absolute right-3 top-3 h-8 w-8 text-muted-foreground hover:text-foreground"
                          onClick={() => copyToClipboard(getQuickstartCode(), "quickstart")}
                        >
                          {copiedState.quickstart ? (
                            <Check className="size-4 text-emerald-500" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Right: Virtual Key Vault */}
                  <Card className="lg:col-span-5 border border-border/40 bg-card/40 backdrop-blur-md rounded-md flex flex-col justify-between">
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <KeyRound className="size-4 text-indigo-500" />
                        Virtual Key Vault
                      </CardTitle>
                      <CardDescription>
                        Securely manage provider credentials inside encrypted virtual profiles.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 flex-1">
                      <div className="space-y-3">
                        {[
                          { id: "openai", name: "OpenAI Connect", desc: "Routes GPT models" },
                          { id: "anthropic", name: "Anthropic Connect", desc: "Routes Claude models" },
                          { id: "gemini", name: "Gemini Connect", desc: "Routes Google models" },
                          { id: "azure", name: "Azure OpenAI Connect", desc: "Routes enterprise models" },
                        ].map((provider) => {
                          const state = providerKeys[provider.id] || { connected: false, key: "", latency: 0 }
                          const isEditing = editingProvider === provider.id

                          return (
                            <div key={provider.id} className="rounded-sm border border-border/40 bg-muted/10 p-3 space-y-2.5">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold">{provider.name}</p>
                                  <p className="text-[10px] text-muted-foreground">{provider.desc}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {state.connected ? (
                                    <>
                                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]" variant="outline">
                                        Active ({state.latency}ms)
                                      </Badge>
                                      <Button
                                        size="xs"
                                        variant="ghost"
                                        className="h-6 px-1.5 text-xs text-rose-500 hover:text-rose-600 hover:bg-rose-500/5 rounded-sm"
                                        onClick={() => removeVirtualKey(provider.id)}
                                      >
                                        Disconnect
                                      </Button>
                                    </>
                                  ) : (
                                    <>
                                      <Badge className="bg-muted text-muted-foreground border-border/40 text-[10px]" variant="outline">
                                        Inactive
                                      </Badge>
                                      <Button
                                        size="xs"
                                        variant="outline"
                                        className="h-6 px-2 text-xs rounded-sm"
                                        onClick={() => {
                                          setEditingProvider(provider.id)
                                          setTempKey("")
                                        }}
                                      >
                                        Connect
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>

                              {isEditing && (
                                <div className="flex gap-2 border-t pt-2 mt-2">
                                  <Input
                                    type="password"
                                    placeholder="Paste provider key (sk-...)"
                                    className="h-7 text-xs rounded-sm border-border/60"
                                    value={tempKey}
                                    onChange={(e) => setTempKey(e.target.value)}
                                  />
                                  <Button
                                    size="sm"
                                    className="h-7 text-xs rounded-sm"
                                    onClick={() => saveVirtualKey(provider.id, tempKey)}
                                  >
                                    Save
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 text-xs rounded-sm"
                                    onClick={() => setEditingProvider(null)}
                                  >
                                    <X className="size-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* GUARDRAILS & SANDBOX PLAYGROUND */}
                <div className="grid gap-6 lg:grid-cols-12">
                  {/* Left: Guardrails Deck */}
                  <Card className="lg:col-span-5 border border-border/40 bg-card/40 backdrop-blur-md rounded-md flex flex-col justify-between">
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <ShieldCheck className="size-4 text-indigo-500" />
                        Compliance & Guardrails
                      </CardTitle>
                      <CardDescription>
                        Set content security controls and active redact policies.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 flex-1">
                      <div className="space-y-4">
                        {[
                          { id: "pii", name: "PII Redaction Shield", desc: "Scan context records and mask credentials/names.", hasAction: true },
                          { id: "injection", name: "Prompt Injection Defense", desc: "Block instructions attempting override.", hasAction: false },
                          { id: "toxicity", name: "Toxicity & Brand Compliance", desc: "Restricts profane or unhelpful answers.", hasAction: false },
                          { id: "schema", name: "Schema Output Matcher", desc: "Enforce strict JSON schemas on provider outputs.", hasAction: false },
                        ].map((guard) => {
                          const state = guardrailsList[guard.id as keyof typeof guardrailsList]

                          return (
                            <div key={guard.id} className="flex items-start justify-between gap-4 p-3 rounded-sm border border-border/40 bg-muted/10">
                              <div className="space-y-1">
                                <p className="text-xs font-semibold">{guard.name}</p>
                                <p className="text-[10px] text-muted-foreground leading-relaxed">{guard.desc}</p>
                                {guard.hasAction && state.enabled && (
                                  <div className="flex items-center gap-2 mt-2">
                                    <span className="text-[9px] text-muted-foreground uppercase font-mono">Action:</span>
                                    <select
                                      className="bg-background border border-border/40 text-[9px] rounded-sm px-1 py-0.5 outline-none cursor-pointer"
                                      value={state.action}
                                      onChange={(e) => {
                                        setGuardrailsList(prev => ({
                                          ...prev,
                                          [guard.id]: { ...prev[guard.id as keyof typeof guardrailsList], action: e.target.value }
                                        }))
                                      }}
                                    >
                                      <option value="mask">Redact values</option>
                                      <option value="block">Block request</option>
                                    </select>
                                  </div>
                                )}
                              </div>
                              <Switch
                                checked={state.enabled}
                                onCheckedChange={(checked) => {
                                  setGuardrailsList(prev => ({
                                    ...prev,
                                    [guard.id]: { ...prev[guard.id as keyof typeof guardrailsList], enabled: checked }
                                  }))
                                }}
                              />
                            </div>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Right: Live Sandbox Playground */}
                  <Card className="lg:col-span-7 border border-border/40 bg-card/40 backdrop-blur-md rounded-md flex flex-col justify-between">
                    <CardHeader>
                      <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <Terminal className="size-4 text-indigo-500" />
                        AI Gateway Sandbox
                      </CardTitle>
                      <CardDescription>
                        Test real-time routing, caching, and guardrail validations live.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 flex-1">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1">
                          <label className="text-[11px] text-muted-foreground font-semibold">Select Sandbox Model</label>
                          <select
                            className="w-full bg-background border border-border/60 text-xs rounded-sm p-1.5 cursor-pointer outline-none focus:ring-1 focus:ring-indigo-500"
                            value={playgroundModel}
                            onChange={(e) => setPlaygroundModel(e.target.value)}
                          >
                            <option value="gpt-4o-mini">gpt-4o-mini (OpenAI)</option>
                            <option value="claude-3-5-sonnet">claude-3-5-sonnet (Anthropic)</option>
                            <option value="gemini-1.5-pro">gemini-1.5-pro (Google)</option>
                          </select>
                        </div>
                        <div className="flex items-center gap-2 sm:mt-5 text-xs text-muted-foreground bg-muted/30 p-2.5 rounded-sm border border-border/40">
                          <ShieldCheck className="size-4 text-emerald-500 shrink-0" />
                          <span>Try using <code className="bg-muted px-1 py-0.5 rounded font-mono text-[10px] text-primary">ignore previous</code> to trigger prompt guardrails!</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[11px] text-muted-foreground font-semibold">User Query / Prompt</label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Type a query for the model..."
                            className="text-xs rounded-sm border-border/60 flex-1 h-9"
                            value={playgroundPrompt}
                            onChange={(e) => setPlaygroundPrompt(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handlePlaygroundSubmit()
                            }}
                          />
                          <Button
                            size="sm"
                            className="h-9 rounded-sm bg-indigo-500 hover:bg-indigo-600 text-white"
                            disabled={playgroundStatus === "loading" || !providerKeys[selectedProvider]?.connected}
                            onClick={handlePlaygroundSubmit}
                          >
                            {playgroundStatus === "loading" ? (
                              <RefreshCw className="size-4 animate-spin" />
                            ) : (
                              <Play className="size-4" />
                            )}
                            Route
                          </Button>
                        </div>
                      </div>

                      {/* Response Terminal */}
                      <div className="relative rounded border border-border/60 bg-muted/40 p-4 font-mono text-[11px] leading-relaxed min-h-[140px] flex flex-col justify-between">
                        <div className="text-muted-foreground whitespace-pre-wrap flex-1 max-h-[160px] overflow-y-auto">
                          {playgroundStatus === "loading" && (
                            <span className="text-indigo-500 flex items-center gap-1.5 animate-pulse">
                              <span className="size-1.5 rounded-full bg-indigo-500 animate-ping" />
                              Routing request through Cosavu AI Gateway...
                            </span>
                          )}
                          {playgroundStatus === "idle" && (
                            <span className="opacity-40 italic">Gateway terminal idle. Press &quot;Route&quot; to execute.</span>
                          )}
                          {playgroundStatus !== "loading" && playgroundResponse}
                        </div>

                        {/* Metrics panel inside terminal */}
                        {playgroundStatus === "done" && (
                          <div className="mt-4 pt-2 border-t border-border/40 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-muted-foreground">
                            <div>
                              Latency: <span className="font-semibold text-foreground">{playgroundStats.totalTimeMs}ms</span>
                            </div>
                            <div>
                              Cache: <span className={`font-semibold ${playgroundStats.cached ? 'text-emerald-500' : 'text-amber-500'}`}>{playgroundStats.cached ? 'HIT' : 'MISS'}</span>
                            </div>
                            <div>
                              Tokens: <span className="font-semibold text-foreground">{playgroundStats.cached ? playgroundStats.tokensSaved : 0} saved</span>
                            </div>
                            <div>
                              Cost Saved: <span className="font-semibold text-emerald-500">${playgroundStats.costSaved.toFixed(4)}</span>
                            </div>
                          </div>
                        )}

                        {playgroundStatus === "error" && (
                          <div className="mt-4 pt-2 border-t border-border/40 text-[10px] text-rose-500 font-semibold flex items-center gap-1.5">
                            <ShieldAlert className="size-3.5 shrink-0" />
                            <span>Gateway blocked the request to protect local Context data store.</span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="telemetry-dashboard" className="space-y-6 outline-none">
                <Card className="border border-border/40 bg-card/40 backdrop-blur-md rounded-md shadow-md">
                  <CardHeader className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                    <div className="space-y-2">
                      <div className="flex flex-wrap gap-2">
                        <Badge className="w-fit rounded-sm" variant="secondary">
                          Workspace overview
                        </Badge>
                        <Badge
                          className="w-fit rounded-sm font-mono"
                          variant="outline"
                        >
                          {COSAVU_STAN_API_BASE_URL}
                        </Badge>
                        <Badge
                          className="w-fit rounded-sm font-mono"
                          variant="outline"
                        >
                          {COSAVU_DATA_API_BASE_URL}
                        </Badge>
                      </div>
                      <CardTitle className="text-2xl font-semibold tracking-tight md:text-3xl">
                        Getting Started
                      </CardTitle>
                      <CardDescription className="max-w-2xl">
                        One console view for API keys, isolated buckets, warehouse
                        sync, query health, ContextAPI savings, billing, tenants,
                        and administration.
                      </CardDescription>
                    </div>
                    <CardAction className="col-span-full col-start-1 row-start-2 flex flex-wrap items-center gap-2 justify-self-start lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:justify-self-end">
                      <Button asChild variant="outline" className="rounded-sm">
                        <Link href="/context-api">
                          <Sparkles className="size-4" />
                          ContextAPI
                        </Link>
                      </Button>
                      <Button asChild className="rounded-sm">
                        <Link href="/query-analytics">
                          <BarChart2 className="size-4" />
                          Analytics
                        </Link>
                      </Button>
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-sm bg-muted/30 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Tokens saved
                          </span>
                          <Zap className="size-4 text-muted-foreground" />
                        </div>
                        <p className="text-2xl font-semibold">
                          {formatCompact(overview.context.savedTokens)}
                        </p>
                      </div>
                      <div className="rounded-sm bg-muted/30 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Spend avoided
                          </span>
                          <BadgeDollarSign className="size-4 text-muted-foreground" />
                        </div>
                        <p className="text-2xl font-semibold">
                          {formatCurrency(overview.context.spendSaved)}
                        </p>
                      </div>
                      <div className="rounded-sm bg-muted/30 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Query success
                          </span>
                          <ShieldCheck className="size-4 text-muted-foreground" />
                        </div>
                        <p className="text-2xl font-semibold">
                          {overview.queries.successRate}%
                        </p>
                      </div>
                      <div className="rounded-sm bg-muted/30 p-4">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            Cloud data
                          </span>
                          <Database className="size-4 text-muted-foreground" />
                        </div>
                        <p className="text-2xl font-semibold">
                          {formatBytes(
                            overview.buckets.storageBytes +
                              overview.warehouse.indexedBytes
                          )}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                  <Card className="border border-border/40 bg-card/40 backdrop-blur-md rounded-md shadow-md">
                    <CardHeader>
                      <CardTitle>Token savings</CardTitle>
                      <CardDescription>
                        STAN context reduction and estimated savings across the
                        week.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-5">
                      <div className="flex h-48 items-end gap-3 rounded-sm bg-muted/25 p-4">
                        {savingsTrend.map((item) => {
                          const height = Math.max(
                            14,
                            Math.round((item.tokens / maxTrendValue) * 100)
                          )

                          return (
                            <div
                              key={item.day}
                              className="flex h-full flex-1 flex-col justify-end gap-2"
                            >
                              <div className="flex min-h-0 flex-1 items-end">
                                <div
                                  className="w-full rounded-sm bg-primary"
                                  style={{ height: `${height}%` }}
                                />
                              </div>
                              <div className="text-center">
                                <p className="text-xs font-medium">{item.day}</p>
                                <p className="text-[11px] text-muted-foreground">
                                  {formatCompact(item.tokens)}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">Reduction</p>
                          <p className="mt-2 text-xl font-semibold">
                            {overview.context.reduction}%
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Latency saved
                          </p>
                          <p className="mt-2 text-xl font-semibold">
                            {overview.context.latencySaved}ms
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Context calls
                          </p>
                          <p className="mt-2 text-xl font-semibold">
                            {formatCompact(overview.context.requests)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border border-border/40 bg-card/40 backdrop-blur-md rounded-md shadow-md">
                    <CardHeader>
                      <CardTitle>Spend mix</CardTitle>
                      <CardDescription>
                        Current usage bill split across Cosavu surfaces.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {spendMix.map((item) => (
                        <div
                          key={item.label}
                          className="rounded-sm bg-muted/30 p-4"
                        >
                          <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                              <p className="font-medium">{item.label}</p>
                              <p className="text-sm text-muted-foreground">
                                {formatCurrency(item.value)}
                              </p>
                            </div>
                            <Badge className="rounded-sm" variant="outline">
                              {item.share}%
                            </Badge>
                          </div>
                          <Progress value={item.share} className="h-2" />
                        </div>
                      ))}

                      <Separator />

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Monthly usage
                          </p>
                          <p className="mt-2 text-xl font-semibold">
                            {overview.billing.usagePercent}%
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Paid invoices
                          </p>
                          <p className="mt-2 text-xl font-semibold">
                            {overview.billing.paidInvoices}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1fr_0.82fr]">
                  <Card className="border border-border/40 bg-card/40 backdrop-blur-md rounded-md shadow-md">
                    <CardHeader className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
                      <div>
                        <CardTitle>Console cards</CardTitle>
                        <CardDescription>
                          Snapshot cards from every workspace page.
                        </CardDescription>
                      </div>
                      <CardAction className="justify-self-start lg:justify-self-end">
                        <Badge className="rounded-sm" variant="outline">
                          {pageCards.length} pages
                        </Badge>
                      </CardAction>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                        {pageCards.map((card) => {
                          const Icon = card.icon

                          return (
                            <Link
                              key={card.href}
                              href={card.href}
                              className="rounded-sm bg-muted/25 p-4 transition-colors hover:bg-muted/40"
                            >
                              <div className="mb-4 flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium">{card.title}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {card.label}
                                  </p>
                                </div>
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-background text-muted-foreground">
                                  <Icon className="size-5" />
                                </div>
                              </div>
                              <p className="mb-3 text-2xl font-semibold">
                                {card.metric}
                              </p>
                              <Progress value={card.progress} className="h-2" />
                            </Link>
                          )
                        })}
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <Card className="border border-border/40 bg-card/40 backdrop-blur-md rounded-md shadow-md">
                      <CardHeader>
                        <CardTitle>Operational health</CardTitle>
                        <CardDescription>
                          Query, storage, and administration posture.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {[
                          {
                            label: "CAR retention",
                            value: overview.queries.retentionRate,
                            icon: Target,
                          },
                          {
                            label: "Query success",
                            value: overview.queries.successRate,
                            icon: ShieldCheck,
                          },
                          {
                            label: "Workspace security",
                            value: overview.admin.securityScore,
                            icon: Gauge,
                          },
                        ].map((item) => {
                          const Icon = item.icon

                          return (
                            <div
                              key={item.label}
                              className="rounded-sm bg-muted/30 p-4"
                            >
                              <div className="mb-3 flex items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  <Icon className="size-4 text-muted-foreground" />
                                  <p className="font-medium">{item.label}</p>
                                </div>
                                <span className="text-sm text-muted-foreground">
                                  {item.value}%
                                </span>
                              </div>
                              <Progress value={item.value} className="h-2" />
                            </div>
                          )
                        })}
                      </CardContent>
                    </Card>

                    <Card className="border border-border/40 bg-card/40 backdrop-blur-md rounded-md shadow-md">
                      <CardHeader>
                        <CardTitle>Latest activity</CardTitle>
                        <CardDescription>
                          Fresh signals across the console.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {[
                          {
                            icon: KeyRound,
                            title: "API key active",
                            detail: `${overview.api.activeKeys} key ready`,
                          },
                          {
                            icon: Layers3,
                            title: "Context optimized",
                            detail: `${formatCompact(overview.context.savedTokens)} tokens removed`,
                          },
                          {
                            icon: Database,
                            title: "Buckets indexed",
                            detail: `${formatNumber(overview.buckets.files)} files protected`,
                          },
                          {
                            icon: Clock,
                            title: "Query p95",
                            detail: `${overview.queries.p95Latency}ms response path`,
                          },
                        ].map((item) => {
                          const Icon = item.icon

                          return (
                            <div
                              key={item.title}
                              className="flex items-center gap-3 rounded-sm bg-muted/30 p-4"
                            >
                              <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-background text-muted-foreground">
                                <Icon className="size-5" />
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium">{item.title}</p>
                                <p className="truncate text-sm text-muted-foreground">
                                  {item.detail}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

function estimateSpend(tokens: number) {
  return (tokens / 1000) * 0.002
}
