"use client"

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  BadgeDollarSign,
  BarChart2,
  Boxes,
  ChevronRight,
  Clock,
  CreditCard,
  Database,
  Gauge,
  KeyRound,
  Layers3,
  List,
  Moon,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Target,
  Unplug,
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

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true))

    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const unsubscribe = watchConsoleAuth(async (currentUser) => {
      if (!currentUser) {
        router.push("/login")
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
        <div className="flex min-h-screen w-full bg-background text-foreground">
          <AppSidebar />
          <SidebarInset className="flex h-screen w-full flex-col overflow-y-auto shadow-none">
            <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 bg-background px-4">
              <SidebarTrigger className="-ml-2 text-muted-foreground hover:text-foreground" />
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

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background text-foreground">
        <AppSidebar />
        <SidebarInset className="relative flex h-screen w-full flex-col overflow-y-auto shadow-none">
          <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 bg-background/60 px-4 backdrop-blur-md supports-[backdrop-filter]:bg-background/45">
            <SidebarTrigger className="-ml-2 text-muted-foreground hover:text-foreground" />
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

          <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 p-4 lg:p-6">
            <Card className="rounded-sm border-border/60 shadow-sm">
              <CardHeader className="gap-4 lg:grid-cols-[1fr_auto]">
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
              <Card className="rounded-sm border-border/60 shadow-sm">
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

              <Card className="rounded-sm border-border/60 shadow-sm">
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
              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader className="gap-4 lg:grid-cols-[1fr_auto]">
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
                <Card className="rounded-sm border-border/60 shadow-sm">
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

                <Card className="rounded-sm border-border/60 shadow-sm">
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
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}

function estimateSpend(tokens: number) {
  return (tokens / 1000) * 0.002
}
