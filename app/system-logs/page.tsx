"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Activity,
  AlertTriangle,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Database,
  Download,
  KeyRound,
  List,
  Moon,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  Terminal,
  X,
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
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { COSAVU_ENDPOINTS } from "@/lib/cosavu-api"
import { watchConsoleAuth, type ConsoleUser } from "@/lib/console-auth"
import { isDemoStatsUser } from "@/lib/console-stats"

type LogLevel = "info" | "warning" | "error" | "debug"
type LogSource = "api" | "auth" | "engine" | "storage" | "warehouse" | "billing"

type LogEvent = {
  id: string
  timestamp: string
  level: LogLevel
  source: LogSource
  logger: string
  route: string
  tenant: string
  actor: string
  requestId: string
  statusCode: number
  durationMs: number
  message: string
  details: string
  eventCount?: number
}

const LOCAL_SYSTEM_LOGS_STORAGE_PREFIX = "cosavu:system-logs"
const SEEDED_SYSTEM_LOG_IDS = new Set([
  "log-api-ready",
  "log-warehouse-sync",
  "log-auth-warning",
  "log-file-storage",
  "log-engine-load",
  "log-s3-error",
  "log-billing-checkout",
  "log-model-load",
])

const LEVEL_LABELS: Record<LogLevel, string> = {
  info: "Info",
  warning: "Warning",
  error: "Error",
  debug: "Debug",
}

const SOURCE_LABELS: Record<LogSource, string> = {
  api: "API",
  auth: "Auth",
  engine: "Engine",
  storage: "Storage",
  warehouse: "Warehouse",
  billing: "Billing",
}

const SOURCE_OPTIONS: Array<{ value: "all" | LogSource; label: string }> = [
  { value: "all", label: "All sources" },
  { value: "api", label: "API" },
  { value: "auth", label: "Auth" },
  { value: "engine", label: "Engine" },
  { value: "storage", label: "Storage" },
  { value: "warehouse", label: "Warehouse" },
  { value: "billing", label: "Billing" },
]

const TIME_OPTIONS = [
  { value: "15m", label: "Last 15 minutes", minutes: 15 },
  { value: "1h", label: "Last hour", minutes: 60 },
  { value: "24h", label: "Last 24 hours", minutes: 1440 },
  { value: "7d", label: "Last 7 days", minutes: 10080 },
  { value: "all", label: "All time", minutes: null },
]

function getSystemLogsStorageKey(email?: string | null) {
  return `${LOCAL_SYSTEM_LOGS_STORAGE_PREFIX}:${email?.toLowerCase() || "unknown"}`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value)
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Unknown"

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value))
}

function getRelativeTime(value: string, now: number) {
  const diffMs = now - new Date(value).getTime()
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000))

  if (diffMinutes < 1) return "just now"
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.round(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  return `${Math.round(diffHours / 24)}d ago`
}

function getLevelVariant(level: LogLevel) {
  if (level === "error") return "destructive"
  if (level === "warning" || level === "debug") return "outline"

  return "secondary"
}

function getSourceIcon(source: LogSource) {
  if (source === "auth") return KeyRound
  if (source === "engine") return Activity
  if (source === "storage") return Database
  if (source === "warehouse") return Download
  if (source === "billing") return List

  return Terminal
}

function readLocalSystemLogs(email?: string | null) {
  if (typeof window === "undefined") return []

  try {
    const storedLogs = window.localStorage.getItem(
      getSystemLogsStorageKey(email)
    )
    if (!storedLogs) return []

    const parsedLogs = JSON.parse(storedLogs)
    if (!Array.isArray(parsedLogs)) return []

    return parsedLogs.filter((log): log is LogEvent => {
      return Boolean(
        log?.id &&
        log?.timestamp &&
        log?.message &&
        log?.logger &&
        !SEEDED_SYSTEM_LOG_IDS.has(log.id)
      )
    })
  } catch {
    return []
  }
}

function saveLocalSystemLogs(
  email: string | null | undefined,
  logs: LogEvent[]
) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(
    getSystemLogsStorageKey(email),
    JSON.stringify(logs.slice(0, 250))
  )
}

function createDefaultSystemLogs(email?: string | null) {
  if (!isDemoStatsUser(email)) {
    return [] satisfies LogEvent[]
  }

  const now = new Date().toISOString()
  const actor = email || "workspace@cosavu.com"

  return [
    {
      id: "demo-log-million-success",
      timestamp: now,
      level: "info",
      source: "api",
      logger: "cosavu.api.edge",
      route: `POST ${COSAVU_ENDPOINTS.data.query}`,
      tenant: "enterprise-scale",
      actor,
      requestId: "req_demo_log_million_success",
      statusCode: 200,
      durationMs: 52,
      message: "High-volume query traffic completed",
      details: "Synthetic rollup for the demo account.",
      eventCount: 88_420_137,
    },
    {
      id: "demo-log-million-storage",
      timestamp: now,
      level: "warning",
      source: "storage",
      logger: "cosavu.storage.indexer",
      route: `POST ${COSAVU_ENDPOINTS.data.filesUpload}`,
      tenant: "enterprise-scale",
      actor,
      requestId: "req_demo_log_storage",
      statusCode: 202,
      durationMs: 118,
      message: "Large indexing queue is draining",
      details: "Synthetic storage pressure rollup for the demo account.",
      eventCount: 4_823_119,
    },
    {
      id: "demo-log-million-errors",
      timestamp: now,
      level: "warning",
      source: "engine",
      logger: "cosavu.engine.retry",
      route: `POST ${COSAVU_ENDPOINTS.stan.optimize}`,
      tenant: "enterprise-scale",
      actor,
      requestId: "req_demo_log_retry",
      statusCode: 202,
      durationMs: 327,
      message: "Optimization retries resolved",
      details: "Synthetic retry recovery rollup for the demo account.",
      eventCount: 927_413,
    },
  ] satisfies LogEvent[]
}

export default function SystemLogsPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [clockNow, setClockNow] = useState(() => Date.now())
  const [user, setUser] = useState<ConsoleUser | null>(null)
  const [logs, setLogs] = useState<LogEvent[]>([])
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [levelFilter, setLevelFilter] = useState("all")
  const [sourceFilter, setSourceFilter] = useState("all")
  const [timeFilter, setTimeFilter] = useState("24h")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const demoStatsActive = isDemoStatsUser(user?.email)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true))

    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const interval = window.setInterval(() => setClockNow(Date.now()), 30000)

    return () => window.clearInterval(interval)
  }, [])

  const effectiveLevelFilter =
    demoStatsActive && levelFilter === "error" ? "all" : levelFilter

  useEffect(() => {
    const unsubscribe = watchConsoleAuth((currentUser) => {
      if (!currentUser) {
        router.push("/login")
        return
      }

      const storedLogs = readLocalSystemLogs(currentUser.email)
      const demoLogs = createDefaultSystemLogs(currentUser.email)
      const shouldMergeDemo = isDemoStatsUser(currentUser.email)
      const nextLogs = shouldMergeDemo
        ? [
            ...demoLogs,
            ...storedLogs.filter(
              (log) => !demoLogs.some((demo) => demo.id === log.id)
            ),
          ]
        : storedLogs.length > 0
          ? storedLogs
          : demoLogs

      if (shouldMergeDemo || storedLogs.length === 0) {
        saveLocalSystemLogs(currentUser.email, nextLogs)
      }

      setUser(currentUser)
      setLogs(nextLogs)
      setSelectedLogId(nextLogs[0]?.id ?? null)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [router])

  const filteredLogs = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const timeOption = TIME_OPTIONS.find(
      (option) => option.value === timeFilter
    )
    const cutoff =
      timeOption?.minutes == null
        ? null
        : clockNow - timeOption.minutes * 60 * 1000

    return logs.filter((log) => {
      const matchesLevel =
        effectiveLevelFilter === "all" || log.level === effectiveLevelFilter
      const matchesSource =
        sourceFilter === "all" || log.source === sourceFilter
      const matchesTime = !cutoff || new Date(log.timestamp).getTime() >= cutoff
      const matchesQuery =
        !normalizedQuery ||
        log.message.toLowerCase().includes(normalizedQuery) ||
        log.logger.toLowerCase().includes(normalizedQuery) ||
        log.route.toLowerCase().includes(normalizedQuery) ||
        log.requestId.toLowerCase().includes(normalizedQuery)

      return matchesLevel && matchesSource && matchesTime && matchesQuery
    })
  }, [clockNow, effectiveLevelFilter, logs, query, sourceFilter, timeFilter])

  const selectedLog = useMemo(() => {
    return (
      logs.find((log) => log.id === selectedLogId) || filteredLogs[0] || logs[0]
    )
  }, [filteredLogs, logs, selectedLogId])

  const stats = useMemo(() => {
    const totalEvents = logs.reduce(
      (sum, log) => sum + (log.eventCount ?? 1),
      0
    )
    const errors = logs.reduce(
      (sum, log) => sum + (log.level === "error" ? (log.eventCount ?? 1) : 0),
      0
    )
    const warnings = logs.reduce(
      (sum, log) => sum + (log.level === "warning" ? (log.eventCount ?? 1) : 0),
      0
    )
    const averageLatency =
      totalEvents === 0
        ? 0
        : Math.round(
            logs.reduce(
              (sum, log) => sum + log.durationMs * (log.eventCount ?? 1),
              0
            ) / totalEvents
          )
    const successRate =
      totalEvents === 0
        ? 100
        : Math.round(
            (logs.reduce(
              (sum, log) =>
                sum + (log.statusCode < 400 ? (log.eventCount ?? 1) : 0),
              0
            ) /
              totalEvents) *
              100
          )

    return {
      totalEvents,
      errors,
      warnings,
      averageLatency,
      successRate,
    }
  }, [logs])

  const refreshLogs = () => {
    setRefreshing(true)
    setErrorMessage(null)

    const storedLogs = readLocalSystemLogs(user?.email)
    const nextLogs = storedLogs.length > 0 ? storedLogs : logs

    setLogs(nextLogs)
    setSelectedLogId(nextLogs[0]?.id ?? null)

    window.setTimeout(() => setRefreshing(false), 650)
  }

  const exportLogs = async () => {
    const payload = JSON.stringify(filteredLogs, null, 2)
    await navigator.clipboard.writeText(payload)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (loading) {
    return (
      <SidebarProvider defaultOpen>
        <div className="flex min-h-screen w-full bg-background text-foreground">
          <AppSidebar />
          <SidebarInset className="flex h-screen w-full flex-col overflow-y-auto shadow-none">
            <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 bg-background px-4">
              <SidebarTrigger className="-ml-2 text-muted-foreground hover:text-foreground" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="ml-auto size-8 rounded-full" />
            </header>
            <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 p-4 lg:p-6">
              <Skeleton className="h-40 w-full rounded-sm" />
              <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
                <Skeleton className="h-96 w-full rounded-sm" />
                <Skeleton className="h-96 w-full rounded-sm" />
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
                <BreadcrumbItem>Observability</BreadcrumbItem>
                <BreadcrumbSeparator>
                  <ChevronRight className="size-3.5" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbPage>System Logs</BreadcrumbPage>
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
                    aria-label="Refresh logs"
                    disabled={refreshing}
                    onClick={refreshLogs}
                  >
                    <RefreshCw
                      className={refreshing ? "size-4 animate-spin" : "size-4"}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh logs</TooltipContent>
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
              <CardHeader className="gap-4 md:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge className="w-fit rounded-sm" variant="secondary">
                      Runtime observability
                    </Badge>
                    <Badge
                      className="w-fit rounded-sm font-mono"
                      variant="outline"
                    >
                      {COSAVU_ENDPOINTS.stan.health}
                    </Badge>
                    <Badge
                      className="w-fit rounded-sm font-mono"
                      variant="outline"
                    >
                      {COSAVU_ENDPOINTS.data.health}
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl font-semibold tracking-tight md:text-3xl">
                    System Logs
                  </CardTitle>
                  <CardDescription className="max-w-2xl">
                    Inspect Cosavu API, auth, storage, warehouse, and engine
                    events across tenant-scoped services.
                  </CardDescription>
                </div>
                <CardAction className="col-span-full col-start-1 row-start-2 flex flex-wrap items-center gap-2 justify-self-start md:col-span-1 md:col-start-2 md:row-start-1 md:justify-self-end">
                  <Button
                    variant="outline"
                    className="rounded-sm"
                    onClick={exportLogs}
                  >
                    {copied ? (
                      <Check className="size-4 text-emerald-600" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Export JSON
                  </Button>
                  <Button
                    className="rounded-sm"
                    onClick={refreshLogs}
                    disabled={refreshing}
                  >
                    <RefreshCw
                      className={refreshing ? "size-4 animate-spin" : "size-4"}
                    />
                    Refresh
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Events
                      </span>
                      <List className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {formatNumber(stats.totalEvents)}
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {demoStatsActive ? "Warnings" : "Errors"}
                      </span>
                      <AlertTriangle className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {formatNumber(
                        demoStatsActive ? stats.warnings : stats.errors
                      )}
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Avg latency
                      </span>
                      <Clock className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {stats.averageLatency}ms
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Success
                      </span>
                      <ShieldCheck className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {stats.successRate}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {errorMessage && (
              <Card className="rounded-sm border-destructive/30 bg-destructive/5 shadow-sm">
                <CardContent className="flex items-center justify-between gap-4">
                  <p className="text-sm text-destructive">{errorMessage}</p>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="rounded-sm"
                    aria-label="Dismiss error"
                    onClick={() => setErrorMessage(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            )}

            <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader className="gap-4 lg:grid-cols-[1fr_auto]">
                  <div>
                    <CardTitle>Log stream</CardTitle>
                    <CardDescription>
                      Filter by severity, source, time window, or request text.
                    </CardDescription>
                  </div>
                  <CardAction className="col-span-full col-start-1 row-start-2 flex w-full flex-col gap-2 justify-self-stretch lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:w-auto lg:justify-self-end">
                    <div className="flex w-full flex-col gap-2 sm:flex-row">
                      <div className="relative w-full sm:w-72">
                        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          className="h-9 rounded-sm pl-9"
                          placeholder="Search logs..."
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                        />
                      </div>
                      <Select
                        value={sourceFilter}
                        onValueChange={setSourceFilter}
                      >
                        <SelectTrigger className="h-9 w-full rounded-sm sm:w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-sm">
                          {SOURCE_OPTIONS.map((option) => (
                            <SelectItem
                              key={option.value}
                              className="rounded-sm"
                              value={option.value}
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={timeFilter} onValueChange={setTimeFilter}>
                        <SelectTrigger className="h-9 w-full rounded-sm sm:w-44">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-sm">
                          {TIME_OPTIONS.map((option) => (
                            <SelectItem
                              key={option.value}
                              className="rounded-sm"
                              value={option.value}
                            >
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Tabs
                      value={effectiveLevelFilter}
                      onValueChange={setLevelFilter}
                      className="w-full"
                    >
                      <TabsList className="w-full rounded-sm [&_[data-slot=tabs-trigger]]:rounded-sm">
                        <TabsTrigger className="rounded-sm" value="all">
                          All
                        </TabsTrigger>
                        {!demoStatsActive && (
                          <TabsTrigger className="rounded-sm" value="error">
                            Error
                          </TabsTrigger>
                        )}
                        <TabsTrigger className="rounded-sm" value="warning">
                          Warn
                        </TabsTrigger>
                        <TabsTrigger className="rounded-sm" value="info">
                          Info
                        </TabsTrigger>
                        <TabsTrigger className="rounded-sm" value="debug">
                          Debug
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {filteredLogs.length > 0 ? (
                      filteredLogs.map((log) => {
                        const isSelected = selectedLog?.id === log.id
                        const SourceIcon = getSourceIcon(log.source)

                        return (
                          <button
                            key={log.id}
                            type="button"
                            className={`w-full rounded-sm bg-muted/20 p-4 text-left transition-colors hover:bg-muted/35 ${
                              isSelected ? "ring-2 ring-primary/40" : ""
                            }`}
                            onClick={() => setSelectedLogId(log.id)}
                          >
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,0.65fr)] lg:items-center">
                              <div className="flex min-w-0 items-start gap-4">
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-background text-muted-foreground">
                                  <SourceIcon className="size-5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge
                                      className="rounded-sm capitalize"
                                      variant={getLevelVariant(log.level)}
                                    >
                                      {LEVEL_LABELS[log.level]}
                                    </Badge>
                                    <Badge
                                      className="rounded-sm"
                                      variant="outline"
                                    >
                                      {SOURCE_LABELS[log.source]}
                                    </Badge>
                                    <p className="text-xs text-muted-foreground">
                                      {getRelativeTime(log.timestamp, clockNow)}
                                    </p>
                                  </div>
                                  <p className="mt-2 truncate font-medium">
                                    {log.message}
                                  </p>
                                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                    {log.logger} | {log.route}
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    HTTP {log.statusCode}
                                  </span>
                                  <span className="font-medium">
                                    {log.durationMs}ms
                                  </span>
                                </div>
                                <Progress
                                  value={Math.min(100, log.durationMs / 20)}
                                  className="h-2"
                                />
                              </div>
                            </div>
                          </button>
                        )
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center rounded-sm bg-muted/20 px-6 py-16 text-center">
                        <div className="mb-4 flex size-12 items-center justify-center rounded-sm bg-muted">
                          <Terminal className="size-5 text-muted-foreground" />
                        </div>
                        <p className="font-medium">No logs match filters</p>
                        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                          Change the filters or refresh logs.
                        </p>
                        <Button
                          className="mt-5 rounded-sm"
                          onClick={refreshLogs}
                        >
                          <RefreshCw className="size-4" />
                          Refresh logs
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle>Selected event</CardTitle>
                  <CardDescription>
                    Request metadata and structured runtime context.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedLog ? (
                    <>
                      <div className="rounded-sm bg-muted/30 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                className="rounded-sm capitalize"
                                variant={getLevelVariant(selectedLog.level)}
                              >
                                {LEVEL_LABELS[selectedLog.level]}
                              </Badge>
                              <Badge className="rounded-sm" variant="outline">
                                {SOURCE_LABELS[selectedLog.source]}
                              </Badge>
                            </div>
                            <p className="mt-3 text-lg font-semibold">
                              {selectedLog.message}
                            </p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {formatTimestamp(selectedLog.timestamp)}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-sm"
                            aria-label="Copy request id"
                            onClick={async () => {
                              await navigator.clipboard.writeText(
                                selectedLog.requestId
                              )
                              setCopied(true)
                              window.setTimeout(() => setCopied(false), 1800)
                            }}
                          >
                            {copied ? (
                              <Check className="size-4 text-emerald-600" />
                            ) : (
                              <Copy className="size-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Request ID
                          </p>
                          <p className="mt-2 truncate font-mono text-xs font-medium">
                            {selectedLog.requestId}
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Tenant
                          </p>
                          <p className="mt-2 text-sm font-medium">
                            {selectedLog.tenant}
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">Actor</p>
                          <p className="mt-2 truncate text-sm font-medium">
                            {selectedLog.actor}
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Duration
                          </p>
                          <p className="mt-2 text-sm font-medium">
                            {selectedLog.durationMs}ms
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-sm bg-muted/30 p-4">
                        <div>
                          <p className="font-medium">Logger</p>
                          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                            {selectedLog.logger}
                          </p>
                        </div>
                        <Separator />
                        <div>
                          <p className="font-medium">Route</p>
                          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                            {selectedLog.route}
                          </p>
                        </div>
                        <Separator />
                        <div>
                          <p className="font-medium">Details</p>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {selectedLog.details}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
