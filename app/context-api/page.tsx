"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  BadgeDollarSign,
  BarChart2,
  Check,
  ChevronRight,
  Clock,
  Copy,
  Gauge,
  Layers3,
  Moon,
  RefreshCw,
  Search,
  Sparkles,
  Sun,
  Target,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { COSAVU_ENDPOINTS, COSAVU_STAN_API_BASE_URL } from "@/lib/cosavu-api"
import { watchConsoleAuth, type ConsoleUser } from "@/lib/console-auth"
import { isDemoStatsUser } from "@/lib/console-stats"

type ContextTier = "cosavu-small" | "cosavu-medium" | "cosavu-large"
type ContextStatus = "optimized" | "review" | "failed"
type ContextBlockType =
  | "IDENTITY"
  | "CONTEXT"
  | "INSTRUCTION"
  | "CONSTRAINT"
  | "EXAMPLE"
  | "OUTPUT_FORMAT"

type ContextBlock = {
  blockType: ContextBlockType
  originalTokens: number
  optimizedTokens: number
}

type ContextRun = {
  id: string
  timestamp: string
  tenant: string
  source: string
  route: string
  modelTier: ContextTier
  status: ContextStatus
  requestCount: number
  originalTokens: number
  optimizedTokens: number
  unoptimizedLatencyMs: number
  optimizedLatencyMs: number
  stanInferenceMs: number
  compressionTarget: number
  messinessScore: number
  priority: number
  temperaturePenalty: number
  reasoningBudget: number
  notes: string[]
  blocks: ContextBlock[]
}

const LOCAL_CONTEXT_API_STORAGE_PREFIX = "cosavu:context-api"
const ESTIMATED_CONTEXT_COST_PER_1K_TOKENS = 0.002
const SEEDED_CONTEXT_RUN_IDS = new Set([
  "context-stan-prod",
  "context-query-pack",
  "context-audit-summary",
  "context-warehouse-sync",
])

const BLOCK_LABELS: Record<ContextBlockType, string> = {
  IDENTITY: "Identity",
  CONTEXT: "Context",
  INSTRUCTION: "Instruction",
  CONSTRAINT: "Constraint",
  EXAMPLE: "Example",
  OUTPUT_FORMAT: "Output format",
}

const STATUS_LABELS: Record<ContextStatus, string> = {
  optimized: "Optimized",
  review: "Review",
  failed: "Failed",
}

const TIER_LABELS: Record<ContextTier, string> = {
  "cosavu-small": "Small",
  "cosavu-medium": "Medium",
  "cosavu-large": "Large",
}

function getContextStorageKey(email?: string | null) {
  return `${LOCAL_CONTEXT_API_STORAGE_PREFIX}:${email?.toLowerCase() || "unknown"}`
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(Math.round(value))
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 100 ? 2 : 0,
    maximumFractionDigits: value < 100 ? 2 : 0,
  }).format(value)
}

function formatTimestamp(value?: string | null) {
  if (!value) return "Unknown"

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function getStatusVariant(status: ContextStatus) {
  if (status === "optimized") return "secondary"
  if (status === "review") return "outline"

  return "destructive"
}

function getTokenReduction(originalTokens: number, optimizedTokens: number) {
  if (originalTokens === 0) return 0

  return Math.round(((originalTokens - optimizedTokens) / originalTokens) * 100)
}

function getSavedTokens(run: ContextRun) {
  return (
    Math.max(0, run.originalTokens - run.optimizedTokens) * run.requestCount
  )
}

function estimateSpend(tokens: number) {
  return (tokens / 1000) * ESTIMATED_CONTEXT_COST_PER_1K_TOKENS
}

function readLocalContextRuns(email?: string | null) {
  if (typeof window === "undefined") return []

  try {
    const storedRuns = window.localStorage.getItem(getContextStorageKey(email))
    if (!storedRuns) return []

    const parsedRuns = JSON.parse(storedRuns)
    if (!Array.isArray(parsedRuns)) return []

    return parsedRuns.filter((run): run is ContextRun => {
      return Boolean(
        run?.id &&
        run?.timestamp &&
        run?.source &&
        run?.blocks &&
        !SEEDED_CONTEXT_RUN_IDS.has(run.id)
      )
    })
  } catch {
    return []
  }
}

function saveLocalContextRuns(
  email: string | null | undefined,
  runs: ContextRun[]
) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(
    getContextStorageKey(email),
    JSON.stringify(runs.slice(0, 100))
  )
}

function createDefaultContextRuns(email?: string | null) {
  if (!isDemoStatsUser(email)) {
    return [] satisfies ContextRun[]
  }

  const now = new Date().toISOString()

  return [
    {
      id: "demo-context-billion-token-savings",
      timestamp: now,
      tenant: "enterprise-scale",
      source: "Million-scale context optimization",
      route: `POST ${COSAVU_ENDPOINTS.stan.optimize}`,
      modelTier: "cosavu-large",
      status: "optimized",
      requestCount: 8_403_217,
      originalTokens: 2253,
      optimizedTokens: 204,
      unoptimizedLatencyMs: 1240,
      optimizedLatencyMs: 318,
      stanInferenceMs: 9,
      compressionTarget: 64,
      messinessScore: 58,
      priority: 94,
      temperaturePenalty: 18,
      reasoningBudget: 82,
      notes: [
        "Synthetic demo account rollup for million-scale token savings.",
        "Large repeated context is reduced before model inference.",
      ],
      blocks: [
        {
          blockType: "IDENTITY",
          originalTokens: 123,
          optimizedTokens: 55,
        },
        {
          blockType: "CONTEXT",
          originalTokens: 1620,
          optimizedTokens: 104,
        },
        {
          blockType: "INSTRUCTION",
          originalTokens: 246,
          optimizedTokens: 28,
        },
        {
          blockType: "CONSTRAINT",
          originalTokens: 148,
          optimizedTokens: 12,
        },
        {
          blockType: "EXAMPLE",
          originalTokens: 74,
          optimizedTokens: 4,
        },
        {
          blockType: "OUTPUT_FORMAT",
          originalTokens: 42,
          optimizedTokens: 1,
        },
      ],
    },
  ] satisfies ContextRun[]
}

export default function ContextApiPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [user, setUser] = useState<ConsoleUser | null>(null)
  const [runs, setRuns] = useState<ContextRun[]>([])
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [tierFilter, setTierFilter] = useState("all")

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true))

    return () => window.cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const unsubscribe = watchConsoleAuth((currentUser) => {
      if (!currentUser) {
        router.push("/login")
        return
      }

      const storedRuns = readLocalContextRuns(currentUser.email)
      const demoRuns = createDefaultContextRuns(currentUser.email)
      const shouldMergeDemo = isDemoStatsUser(currentUser.email)
      const nextRuns = shouldMergeDemo
        ? [
            ...demoRuns,
            ...storedRuns.filter(
              (run) => !demoRuns.some((demo) => demo.id === run.id)
            ),
          ]
        : storedRuns.length > 0
          ? storedRuns
          : demoRuns

      if (shouldMergeDemo || storedRuns.length === 0) {
        saveLocalContextRuns(currentUser.email, nextRuns)
      }

      setUser(currentUser)
      setRuns(nextRuns)
      setSelectedRunId(nextRuns[0]?.id ?? null)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [router])

  const filteredRuns = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    return runs.filter((run) => {
      const matchesTier = tierFilter === "all" || run.modelTier === tierFilter
      const matchesSearch =
        !normalizedSearch ||
        run.source.toLowerCase().includes(normalizedSearch) ||
        run.tenant.toLowerCase().includes(normalizedSearch)

      return matchesTier && matchesSearch
    })
  }, [runs, search, tierFilter])

  const selectedRun = useMemo(() => {
    return (
      runs.find((run) => run.id === selectedRunId) || filteredRuns[0] || runs[0]
    )
  }, [filteredRuns, runs, selectedRunId])

  const stats = useMemo(() => {
    const totalRequests = filteredRuns.reduce(
      (sum, run) => sum + run.requestCount,
      0
    )
    const originalTokens = filteredRuns.reduce(
      (sum, run) => sum + run.originalTokens * run.requestCount,
      0
    )
    const optimizedTokens = filteredRuns.reduce(
      (sum, run) => sum + run.optimizedTokens * run.requestCount,
      0
    )
    const savedTokens = Math.max(0, originalTokens - optimizedTokens)
    const reduction =
      originalTokens === 0
        ? 0
        : Math.round((savedTokens / originalTokens) * 100)
    const weightedLatencySaved =
      totalRequests === 0
        ? 0
        : Math.round(
            filteredRuns.reduce((sum, run) => {
              return (
                sum +
                Math.max(0, run.unoptimizedLatencyMs - run.optimizedLatencyMs) *
                  run.requestCount
              )
            }, 0) / totalRequests
          )
    const stanMs =
      filteredRuns.length === 0
        ? 0
        : Math.round(
            filteredRuns.reduce((sum, run) => sum + run.stanInferenceMs, 0) /
              filteredRuns.length
          )

    return {
      totalRequests,
      originalTokens,
      optimizedTokens,
      savedTokens,
      reduction,
      weightedLatencySaved,
      stanMs,
      spendSaved: estimateSpend(savedTokens),
    }
  }, [filteredRuns])

  const syncContextRuns = () => {
    setSyncing(true)

    const storedRuns = readLocalContextRuns(user?.email)
    const nextRuns = storedRuns.length > 0 ? storedRuns : runs

    setRuns(nextRuns)
    setSelectedRunId(nextRuns[0]?.id ?? null)

    window.setTimeout(() => setSyncing(false), 650)
  }

  const copySummary = async () => {
    const payload = JSON.stringify(
      {
        route: `POST ${COSAVU_ENDPOINTS.stan.optimize}`,
        endpoint: COSAVU_ENDPOINTS.stan.optimize,
        health: COSAVU_ENDPOINTS.stan.health,
        context_api: {
          requests: stats.totalRequests,
          original_tokens: stats.originalTokens,
          optimized_tokens: stats.optimizedTokens,
          saved_tokens: stats.savedTokens,
          reduction_percent: stats.reduction,
          estimated_spend_saved_usd: Number(stats.spendSaved.toFixed(2)),
          stan_inference_ms: stats.stanMs,
        },
      },
      null,
      2
    )

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
              <Skeleton className="h-4 w-52" />
              <Skeleton className="ml-auto size-8 rounded-sm" />
            </header>
            <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 p-4 lg:p-6">
              <Skeleton className="h-48 w-full rounded-sm" />
              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
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
                  <BreadcrumbPage>ContextAPI</BreadcrumbPage>
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
                    aria-label="Sync ContextAPI"
                    disabled={syncing}
                    onClick={syncContextRuns}
                  >
                    <RefreshCw
                      className={syncing ? "size-4 animate-spin" : "size-4"}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Sync ContextAPI</TooltipContent>
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
                  <Badge className="w-fit rounded-sm" variant="secondary">
                    {COSAVU_STAN_API_BASE_URL.replace(/^https?:\/\//, "")}
                  </Badge>
                  <CardTitle className="text-2xl font-semibold tracking-tight md:text-3xl">
                    ContextAPI
                  </CardTitle>
                  <CardDescription className="max-w-2xl">
                    Track how STAN-1-Mini compresses prompt, policy, audit, and
                    warehouse context before inference so token burn and spend
                    stay visible.
                  </CardDescription>
                </div>
                <CardAction className="col-span-full col-start-1 row-start-2 flex flex-wrap items-center gap-2 justify-self-start md:col-span-1 md:col-start-2 md:row-start-1 md:justify-self-end">
                  <Button
                    variant="outline"
                    className="rounded-sm"
                    onClick={copySummary}
                  >
                    {copied ? (
                      <Check className="size-4 text-emerald-600" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    Copy summary
                  </Button>
                  <Button
                    className="rounded-sm"
                    disabled={syncing}
                    onClick={syncContextRuns}
                  >
                    <RefreshCw
                      className={syncing ? "size-4 animate-spin" : "size-4"}
                    />
                    Sync runs
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Context requests
                      </span>
                      <Layers3 className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {formatNumber(stats.totalRequests)}
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Tokens saved
                      </span>
                      <Zap className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {formatNumber(stats.savedTokens)}
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
                      {formatCurrency(stats.spendSaved)}
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Avg reduction
                      </span>
                      <Target className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">{stats.reduction}%</p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Latency saved
                      </span>
                      <Clock className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {stats.weightedLatencySaved}ms
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader className="gap-4">
                  <div>
                    <CardTitle>Optimization runs</CardTitle>
                    <CardDescription>
                      ContextAPI traffic grouped by workload and model tier.
                    </CardDescription>
                  </div>
                  <CardAction className="flex w-full flex-col gap-2 sm:flex-row">
                    <div className="relative w-full">
                      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-9 rounded-sm pl-9"
                        placeholder="Search context runs..."
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                      />
                    </div>
                    <Select value={tierFilter} onValueChange={setTierFilter}>
                      <SelectTrigger className="h-9 w-full rounded-sm sm:w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-sm">
                        <SelectItem className="rounded-sm" value="all">
                          All tiers
                        </SelectItem>
                        <SelectItem className="rounded-sm" value="cosavu-small">
                          Small
                        </SelectItem>
                        <SelectItem
                          className="rounded-sm"
                          value="cosavu-medium"
                        >
                          Medium
                        </SelectItem>
                        <SelectItem className="rounded-sm" value="cosavu-large">
                          Large
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {filteredRuns.length > 0 ? (
                      filteredRuns.map((run) => {
                        const isSelected = selectedRun?.id === run.id
                        const reduction = getTokenReduction(
                          run.originalTokens,
                          run.optimizedTokens
                        )
                        const savedTokens = getSavedTokens(run)

                        return (
                          <button
                            key={run.id}
                            type="button"
                            className={`w-full rounded-sm bg-muted/20 p-4 text-left transition-colors hover:bg-muted/35 ${
                              isSelected ? "ring-2 ring-primary/40" : ""
                            }`}
                            onClick={() => setSelectedRunId(run.id)}
                          >
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                              <div className="flex min-w-0 items-start gap-4">
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-background text-muted-foreground">
                                  <Sparkles className="size-5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Badge
                                      className="rounded-sm"
                                      variant={getStatusVariant(run.status)}
                                    >
                                      {STATUS_LABELS[run.status]}
                                    </Badge>
                                    <Badge
                                      className="rounded-sm"
                                      variant="outline"
                                    >
                                      {TIER_LABELS[run.modelTier]}
                                    </Badge>
                                    <p className="text-xs text-muted-foreground">
                                      {formatTimestamp(run.timestamp)}
                                    </p>
                                  </div>
                                  <p className="mt-2 truncate font-medium">
                                    {run.source}
                                  </p>
                                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                    {run.route} | {run.tenant}
                                  </p>
                                </div>
                              </div>

                              <div className="min-w-40">
                                <div className="mb-2 flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    {reduction}% saved
                                  </span>
                                  <span className="font-medium">
                                    {formatCurrency(estimateSpend(savedTokens))}
                                  </span>
                                </div>
                                <Progress value={reduction} className="h-2" />
                              </div>
                            </div>
                          </button>
                        )
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center rounded-sm bg-muted/20 px-6 py-16 text-center">
                        <div className="mb-4 flex size-12 items-center justify-center rounded-sm bg-muted">
                          <BarChart2 className="size-5 text-muted-foreground" />
                        </div>
                        <p className="font-medium">No ContextAPI runs match</p>
                        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                          Change filters or sync live optimization events.
                        </p>
                        <Button
                          className="mt-5 rounded-sm"
                          onClick={syncContextRuns}
                        >
                          <RefreshCw className="size-4" />
                          Sync runs
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle>Selected run</CardTitle>
                  <CardDescription>
                    STAN metadata, token ledger, and block compression.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedRun ? (
                    <>
                      <div className="rounded-sm bg-muted/30 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                className="rounded-sm"
                                variant={getStatusVariant(selectedRun.status)}
                              >
                                {STATUS_LABELS[selectedRun.status]}
                              </Badge>
                              <Badge className="rounded-sm" variant="outline">
                                {TIER_LABELS[selectedRun.modelTier]}
                              </Badge>
                            </div>
                            <p className="mt-3 text-lg font-semibold">
                              {selectedRun.source}
                            </p>
                            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                              {selectedRun.route} |{" "}
                              {formatTimestamp(selectedRun.timestamp)}
                            </p>
                          </div>
                          <Badge className="rounded-sm" variant="secondary">
                            {getTokenReduction(
                              selectedRun.originalTokens,
                              selectedRun.optimizedTokens
                            )}
                            % reduction
                          </Badge>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Original
                          </p>
                          <p className="mt-2 text-2xl font-semibold">
                            {formatNumber(selectedRun.originalTokens)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            tokens per request
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Optimized
                          </p>
                          <p className="mt-2 text-2xl font-semibold">
                            {formatNumber(selectedRun.optimizedTokens)}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            tokens per request
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">Saved</p>
                          <p className="mt-2 text-2xl font-semibold">
                            {formatNumber(getSavedTokens(selectedRun))}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            tokens this period
                          </p>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            STAN inference
                          </p>
                          <p className="mt-2 text-xl font-semibold">
                            {selectedRun.stanInferenceMs}ms
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Compression target
                          </p>
                          <p className="mt-2 text-xl font-semibold">
                            {selectedRun.compressionTarget}%
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Priority
                          </p>
                          <p className="mt-2 text-xl font-semibold">
                            {selectedRun.priority}%
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Spend avoided
                          </p>
                          <p className="mt-2 text-xl font-semibold">
                            {formatCurrency(
                              estimateSpend(getSavedTokens(selectedRun))
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-sm bg-muted/30 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">STAN controls</p>
                            <p className="text-sm text-muted-foreground">
                              Metadata returned by the local policy controller.
                            </p>
                          </div>
                          <Gauge className="size-5 shrink-0 text-muted-foreground" />
                        </div>
                        <Separator />
                        <div className="space-y-3">
                          {[
                            {
                              label: "Messiness",
                              value: selectedRun.messinessScore,
                            },
                            {
                              label: "Reasoning budget",
                              value: selectedRun.reasoningBudget,
                            },
                            {
                              label: "Temperature penalty",
                              value: selectedRun.temperaturePenalty,
                            },
                          ].map((metric) => (
                            <div key={metric.label}>
                              <div className="mb-2 flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">
                                  {metric.label}
                                </span>
                                <span className="font-medium">
                                  {metric.value}%
                                </span>
                              </div>
                              <Progress value={metric.value} className="h-2" />
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3 rounded-sm bg-muted/30 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium">Context blocks</p>
                          <Badge className="rounded-sm" variant="outline">
                            {selectedRun.blocks.length} blocks
                          </Badge>
                        </div>
                        <Separator />
                        <div className="space-y-3">
                          {selectedRun.blocks.map((block) => {
                            const reduction = getTokenReduction(
                              block.originalTokens,
                              block.optimizedTokens
                            )

                            return (
                              <div key={block.blockType}>
                                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                                  <span className="font-medium">
                                    {BLOCK_LABELS[block.blockType]}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {formatNumber(block.originalTokens)} to{" "}
                                    {formatNumber(block.optimizedTokens)}
                                  </span>
                                </div>
                                <Progress value={reduction} className="h-2" />
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="space-y-3 rounded-sm bg-muted/30 p-4">
                        <p className="font-medium">Run notes</p>
                        <Separator />
                        <div className="space-y-2">
                          {selectedRun.notes.map((note) => (
                            <div
                              key={note}
                              className="flex items-start gap-3 text-sm"
                            >
                              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                              <span className="text-muted-foreground">
                                {note}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-sm border-border/60 shadow-sm">
              <CardHeader className="gap-4 lg:grid-cols-[1fr_auto]">
                <div>
                  <CardTitle>ContextAPI ledger</CardTitle>
                  <CardDescription>
                    Original context versus optimized context for the current
                    filters.
                  </CardDescription>
                </div>
                <CardAction className="justify-self-start lg:justify-self-end">
                  <Badge className="rounded-sm" variant="outline">
                    {formatCurrency(ESTIMATED_CONTEXT_COST_PER_1K_TOKENS)} per
                    1K tokens
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-3">
                  {[
                    {
                      label: "Original token volume",
                      value: stats.originalTokens,
                      icon: Layers3,
                    },
                    {
                      label: "Optimized token volume",
                      value: stats.optimizedTokens,
                      icon: Sparkles,
                    },
                    {
                      label: "Token volume removed",
                      value: stats.savedTokens,
                      icon: Zap,
                    },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="rounded-sm bg-muted/30 p-4"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          {item.label}
                        </p>
                        <item.icon className="size-4 text-muted-foreground" />
                      </div>
                      <p className="text-2xl font-semibold">
                        {formatNumber(item.value)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
