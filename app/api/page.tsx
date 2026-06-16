"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Moon,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { watchConsoleAuth, type ConsoleUser } from "@/lib/console-auth"
import {
  EMPTY_CONSOLE_STATS,
  fetchConsoleStats,
  mergeConsoleStats,
  type ConsoleStats,
} from "@/lib/console-stats"
import { COSAVU_ENDPOINTS } from "@/lib/cosavu-api"
import { createApiKey, getApiKeys } from "@/lib/supabase"

type ApiKey = {
  id: string
  key_name?: string | null
  key_string?: string | null
  user_name?: string | null
  email?: string | null
  enterprise_id?: string | null
  created_at?: string | null
  environment?: "development" | "production" | null
  expires?: boolean | null
  expires_at?: string | null
}

const LOCAL_API_KEYS_STORAGE_PREFIX = "cosavu:api-keys"
const WEEKDAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

function getLocalApiKeysStorageKey(email?: string | null) {
  return `${LOCAL_API_KEYS_STORAGE_PREFIX}:${email?.toLowerCase() || "unknown"}`
}

function mergeApiKeys(...keyGroups: ApiKey[][]) {
  const keysById = new Map<string, ApiKey>()

  for (const key of keyGroups.flat()) {
    const keyId = key.key_string || key.id
    if (!keyId || keysById.has(keyId)) continue

    keysById.set(keyId, key)
  }

  return Array.from(keysById.values()).sort((left, right) => {
    const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0
    const rightTime = right.created_at
      ? new Date(right.created_at).getTime()
      : 0

    return rightTime - leftTime
  })
}

function readLocalApiKeys(email?: string | null) {
  if (typeof window === "undefined") return []

  try {
    const storedKeys = window.localStorage.getItem(
      getLocalApiKeysStorageKey(email)
    )
    if (!storedKeys) return []

    const parsedKeys = JSON.parse(storedKeys)
    if (!Array.isArray(parsedKeys)) return []

    return parsedKeys.filter((key): key is ApiKey => {
      return Boolean(key?.id && key?.key_string)
    })
  } catch {
    return []
  }
}

function saveLocalApiKey(email: string | null | undefined, key: ApiKey) {
  if (typeof window === "undefined") return

  const storageKey = getLocalApiKeysStorageKey(email)
  const keys = mergeApiKeys([key], readLocalApiKeys(email))
  window.localStorage.setItem(storageKey, JSON.stringify(keys))
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value)
}

function formatDate(value?: string | null) {
  if (!value) return "Not issued yet"

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

function formatMonth(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    year: "numeric",
  }).format(value)
}

function getCalendarDays(month: Date) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const firstDay = new Date(year, monthIndex, 1)
  const startDate = new Date(firstDay)
  startDate.setDate(firstDay.getDate() - firstDay.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate)
    date.setDate(startDate.getDate() + index)
    return date
  })
}

function getDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function getKeyLabel(key: ApiKey) {
  return key.key_name || key.user_name || "Development key"
}

function getKeyInitials(key: ApiKey) {
  return getKeyLabel(key).slice(0, 3).toUpperCase()
}

function getKeyEnvironment(key: ApiKey) {
  if (key.environment === "production") return "production"
  if (key.environment === "development") return "integration"

  const label = getKeyLabel(key).toLowerCase()

  if (label.includes("prod")) return "production"
  return "integration"
}

function maskKey(key?: string | null) {
  if (!key) return "No key available"
  if (key.length <= 12) return "*".repeat(20)

  return `${key.slice(0, 8)}${"*".repeat(20)}${key.slice(-4)}`
}

export default function ApiPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const [keys, setKeys] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [user, setUser] = useState<ConsoleUser | null>(null)
  const [usageStats, setUsageStats] =
    useState<ConsoleStats>(EMPTY_CONSOLE_STATS)
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({})
  const [showPrimary, setShowPrimary] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [environmentFilter, setEnvironmentFilter] = useState("all")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [keyName, setKeyName] = useState("")
  const [keyEnvironment, setKeyEnvironment] = useState<
    "development" | "production"
  >("development")
  const [keyExpires, setKeyExpires] = useState(false)
  const [expiryDate, setExpiryDate] = useState<Date | null>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())

  const primaryKey = keys[0]
  const activeKeyCount = Math.max(keys.length, usageStats.activeKeys)
  const latestIssue = primaryKey?.created_at || usageStats.latestIssue
  const quotaPercent = usageStats.monthlyUsagePercent ?? 0
  const quotaLabel =
    usageStats.requestsUsed != null && usageStats.requestLimit != null
      ? `${formatNumber(usageStats.requestsUsed)} / ${formatNumber(usageStats.requestLimit)}`
      : "No metered requests reported"
  const calendarDays = useMemo(
    () => getCalendarDays(calendarMonth),
    [calendarMonth]
  )

  const fetchKeys = async (
    email?: string | null,
    options?: { quiet?: boolean }
  ) => {
    if (options?.quiet) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    const localKeys = readLocalApiKeys(email)
    const { data, error } = await getApiKeys("default", email || undefined)

    if (error) {
      setKeys(localKeys)
      setErrorMessage("Could not sync API keys. Please try again.")
    } else {
      setErrorMessage(null)
      setKeys(mergeApiKeys((data || []) as ApiKey[], localKeys))
    }

    setLoading(false)
    setRefreshing(false)
  }

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
      await fetchKeys(currentUser.email)

      try {
        const liveStats = await fetchConsoleStats(currentUser.email)
        setUsageStats(
          mergeConsoleStats(liveStats, {
            activeKeys: readLocalApiKeys(currentUser.email).length,
            latestIssue: readLocalApiKeys(currentUser.email)[0]?.created_at,
          })
        )
      } catch {
        setUsageStats(EMPTY_CONSOLE_STATS)
      }
    })

    return () => unsubscribe()
  }, [router])

  const filteredKeys = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return keys.filter((key) => {
      const matchesEnvironment =
        environmentFilter === "all" ||
        getKeyEnvironment(key) === environmentFilter
      const matchesQuery =
        !query ||
        getKeyLabel(key).toLowerCase().includes(query) ||
        key.email?.toLowerCase().includes(query) ||
        key.key_string?.toLowerCase().includes(query)

      return matchesEnvironment && matchesQuery
    })
  }, [environmentFilter, keys, searchQuery])

  const openCreateSheet = () => {
    setErrorMessage(null)
    const today = new Date()
    setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    setCreateSheetOpen(true)
  }

  const handleExpiryChange = (checked: boolean) => {
    setKeyExpires(checked)

    if (checked && !expiryDate) {
      const today = new Date()
      setExpiryDate(today)
      setCalendarMonth(new Date(today.getFullYear(), today.getMonth(), 1))
    }
  }

  const moveCalendarMonth = (offset: number) => {
    setCalendarMonth(
      (currentMonth) =>
        new Date(
          currentMonth.getFullYear(),
          currentMonth.getMonth() + offset,
          1
        )
    )
  }

  const handleCreateKey = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault()
    if (!user) return

    const normalizedKeyName = keyName.trim()
    if (!normalizedKeyName) {
      setErrorMessage("Enter a name for this API key.")
      return
    }

    setCreating(true)
    setErrorMessage(null)
    setNewKey(null)

    const userName = normalizedKeyName
    const email = user.email || "unknown@cosavu.com"

    try {
      const { api_key, data, error } = await createApiKey(
        userName,
        email,
        "default"
      )

      if (error || !api_key) {
        setErrorMessage("Could not generate a new key. Please try again.")
        return
      }

      const savedKey = (data || {}) as Partial<ApiKey>
      const issuedKey: ApiKey = {
        id: savedKey.id || `local-${Date.now()}`,
        key_name: normalizedKeyName,
        key_string: savedKey.key_string || api_key,
        user_name: savedKey.user_name || userName,
        email: savedKey.email || email,
        enterprise_id: savedKey.enterprise_id || "default",
        created_at: savedKey.created_at || new Date().toISOString(),
        environment: keyEnvironment,
        expires: keyExpires,
        expires_at: keyExpires && expiryDate ? expiryDate.toISOString() : null,
      }

      saveLocalApiKey(email, issuedKey)
      setKeys((previousKeys) => [
        issuedKey,
        ...previousKeys.filter((key) => key.id !== issuedKey.id),
      ])
      setNewKey(api_key)
      setShowPrimary(true)
      setCreateSheetOpen(false)
      setKeyName("")
      setKeyEnvironment("development")
      setKeyExpires(false)
      setExpiryDate(null)
    } catch {
      setErrorMessage("Could not generate a new key. Please try again.")
    } finally {
      setCreating(false)
    }
  }

  const copyToClipboard = async (
    text: string | null | undefined,
    id: string
  ) => {
    if (!text) return

    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    window.setTimeout(() => setCopiedId(null), 2000)
  }

  const toggleKeyVisibility = (id: string) => {
    setShowKeys((previous) => ({ ...previous, [id]: !previous[id] }))
  }

  if (loading && keys.length === 0) {
    return (
      <SidebarProvider defaultOpen>
        <div className="flex min-h-screen w-full bg-background text-foreground">
          <AppSidebar />
          <SidebarInset className="flex h-screen w-full flex-col overflow-y-auto shadow-none">
            <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 bg-background px-4">
              <SidebarTrigger className="-ml-2 text-muted-foreground hover:text-foreground" />
              <Skeleton className="h-4 w-56" />
              <Skeleton className="ml-auto size-8 rounded-2xl" />
            </header>
            <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 p-4 lg:p-6">
              <Skeleton className="h-32 w-full" />
              <div className="grid gap-4 lg:grid-cols-3">
                <Skeleton className="h-56 lg:col-span-2" />
                <Skeleton className="h-56" />
              </div>
              <Skeleton className="h-80 w-full" />
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
                <BreadcrumbItem>System administration</BreadcrumbItem>
                <BreadcrumbSeparator>
                  <ChevronRight className="size-3.5" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbPage>API keys</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="rounded-2xl"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Refresh API keys"
                    disabled={refreshing}
                    onClick={() => fetchKeys(user?.email, { quiet: true })}
                  >
                    <RefreshCw
                      className={refreshing ? "size-4 animate-spin" : "size-4"}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh keys</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    className="rounded-2xl"
                    variant="ghost"
                    size="icon-sm"
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
                  <Badge
                    className="w-fit rounded-sm font-mono"
                    variant="secondary"
                  >
                    {COSAVU_ENDPOINTS.stan.apiKeys}
                  </Badge>
                  <CardTitle className="text-2xl font-semibold tracking-tight md:text-3xl">
                    API keys
                  </CardTitle>
                  <CardDescription className="max-w-2xl">
                    Issue, copy, and audit credentials for Cosavu integrations
                    from one controlled workspace.
                  </CardDescription>
                </div>
                <CardAction className="col-span-full col-start-1 row-start-2 flex flex-wrap items-center gap-2 justify-self-start md:col-span-1 md:col-start-2 md:row-start-1 md:justify-self-end">
                  <Button
                    className="rounded-2xl"
                    variant="outline"
                    onClick={() => fetchKeys(user?.email, { quiet: true })}
                    disabled={refreshing}
                  >
                    <RefreshCw
                      className={refreshing ? "size-4 animate-spin" : "size-4"}
                    />
                    Sync
                  </Button>
                  <Button
                    className="rounded-2xl"
                    onClick={openCreateSheet}
                    disabled={creating}
                  >
                    {creating ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Generate key
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Active keys
                      </span>
                      <KeyRound className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">{activeKeyCount}</p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Latest issue
                      </span>
                      <ShieldCheck className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {latestIssue ? formatDate(latestIssue) : "None"}
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Monthly usage
                      </span>
                      <Zap className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {usageStats.monthlyUsagePercent == null
                        ? "No usage"
                        : `${usageStats.monthlyUsagePercent}%`}
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
                    className="rounded-2xl"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Dismiss error"
                    onClick={() => setErrorMessage(null)}
                  >
                    <X className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            )}

            {newKey && (
              <Card className="rounded-sm border-emerald-500/25 bg-emerald-500/5 shadow-sm">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                      <Check className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <CardTitle>Credential issued</CardTitle>
                      <CardDescription>
                        Save this key now. For security, it is only shown once.
                      </CardDescription>
                    </div>
                    <Button
                      className="rounded-2xl"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Dismiss new key"
                      onClick={() => setNewKey(null)}
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3 rounded-2xl bg-background/80 p-3 sm:flex-row sm:items-center">
                    <code className="min-w-0 flex-1 font-mono text-sm font-medium break-all">
                      {newKey}
                    </code>
                    <Button
                      className="rounded-2xl"
                      variant="secondary"
                      onClick={() => copyToClipboard(newKey, "new")}
                    >
                      {copiedId === "new" ? (
                        <Check className="size-4 text-emerald-600" />
                      ) : (
                        <Copy className="size-4" />
                      )}
                      Copy key
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="rounded-sm border-border/60 shadow-sm">
              <CardHeader>
                <CardTitle>Primary integration key</CardTitle>
                <CardDescription>
                  Use the latest issued key for server-side Cosavu requests.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-sm bg-muted/40 p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <Badge
                      className="rounded-sm"
                      variant={primaryKey ? "secondary" : "outline"}
                    >
                      {primaryKey ? "Ready" : "No key"}
                    </Badge>
                    <div className="flex items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            className="rounded-sm"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={
                              showPrimary
                                ? "Hide primary key"
                                : "Reveal primary key"
                            }
                            disabled={!primaryKey}
                            onClick={() => setShowPrimary((value) => !value)}
                          >
                            {showPrimary ? (
                              <EyeOff className="size-4" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {showPrimary ? "Hide key" : "Reveal key"}
                        </TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            className="rounded-sm"
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Copy primary key"
                            disabled={!primaryKey}
                            onClick={() =>
                              copyToClipboard(primaryKey?.key_string, "primary")
                            }
                          >
                            {copiedId === "primary" ? (
                              <Check className="size-4 text-emerald-600" />
                            ) : (
                              <Copy className="size-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copy key</TooltipContent>
                      </Tooltip>
                    </div>
                  </div>
                  <code className="block min-h-6 truncate font-mono text-sm font-semibold tracking-wide text-foreground/80">
                    {showPrimary
                      ? primaryKey?.key_string || "No key available"
                      : maskKey(primaryKey?.key_string)}
                  </code>
                  <Separator className="my-4" />
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-muted-foreground">Owner</p>
                      <p className="mt-1 font-medium">
                        {primaryKey?.email || user?.email || "Not assigned"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Issued</p>
                      <p className="mt-1 font-medium">
                        {formatDate(primaryKey?.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">Requests used</span>
                    <span className="font-medium">{quotaLabel}</span>
                  </div>
                  <Progress value={quotaPercent} className="h-2" />
                  <p className="text-xs text-muted-foreground">
                    {usageStats.apiKeyFingerprint
                      ? `Stats source: ${usageStats.apiKeyFingerprint}.`
                      : "Live stats are not reporting monthly quota yet."}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-sm border-border/60 shadow-sm">
              <CardHeader className="gap-4 lg:grid-cols-[1fr_auto]">
                <div>
                  <CardTitle>Issued tokens</CardTitle>
                  <CardDescription>
                    Search, copy, and inspect the keys tied to this workspace.
                  </CardDescription>
                </div>
                <CardAction className="col-span-full col-start-1 row-start-2 flex w-full flex-col gap-2 justify-self-stretch sm:flex-row lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:w-auto lg:justify-self-end">
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="h-9 rounded-2xl pl-9"
                      placeholder="Search keys..."
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                    />
                  </div>
                  <Tabs
                    value={environmentFilter}
                    onValueChange={setEnvironmentFilter}
                  >
                    <TabsList className="rounded-2xl">
                      <TabsTrigger className="rounded-2xl" value="all">
                        All
                      </TabsTrigger>
                      <TabsTrigger className="rounded-2xl" value="production">
                        Prod
                      </TabsTrigger>
                      <TabsTrigger className="rounded-2xl" value="integration">
                        Dev
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-2xl bg-muted/20">
                  {filteredKeys.length > 0 ? (
                    <div className="divide-y divide-border/60">
                      {filteredKeys.map((key) => {
                        const isVisible = Boolean(showKeys[key.id])
                        const environment = getKeyEnvironment(key)

                        return (
                          <div
                            key={key.id}
                            className="grid gap-4 bg-card p-4 transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1.4fr)_minmax(180px,0.8fr)_auto] md:items-center"
                          >
                            <div className="flex min-w-0 items-center gap-4">
                              <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-muted text-xs font-semibold text-muted-foreground">
                                {getKeyInitials(key)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-sm font-medium capitalize">
                                    {getKeyLabel(key)}
                                  </p>
                                  <Badge
                                    className="rounded-2xl"
                                    variant={
                                      environment === "production"
                                        ? "default"
                                        : "outline"
                                    }
                                  >
                                    {environment === "production"
                                      ? "Production"
                                      : "Integration"}
                                  </Badge>
                                </div>
                                <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                  {isVisible
                                    ? key.key_string || "No key available"
                                    : maskKey(key.key_string)}
                                </p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 text-sm md:block md:space-y-1">
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Owner
                                </p>
                                <p className="truncate font-medium">
                                  {key.email || user?.email || "Workspace"}
                                </p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">
                                  Issued
                                </p>
                                <p className="font-medium">
                                  {formatDate(key.created_at)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    className="rounded-2xl"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={
                                      isVisible ? "Hide key" : "Reveal key"
                                    }
                                    onClick={() => toggleKeyVisibility(key.id)}
                                  >
                                    {isVisible ? (
                                      <EyeOff className="size-4" />
                                    ) : (
                                      <Eye className="size-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {isVisible ? "Hide key" : "Reveal key"}
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    className="rounded-2xl"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Copy key"
                                    onClick={() =>
                                      copyToClipboard(key.key_string, key.id)
                                    }
                                  >
                                    {copiedId === key.id ? (
                                      <Check className="size-4 text-emerald-600" />
                                    ) : (
                                      <Copy className="size-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Copy key</TooltipContent>
                              </Tooltip>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    className="rounded-2xl"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Open key actions"
                                  >
                                    <MoreVertical className="size-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent
                                  align="end"
                                  className="rounded-sm"
                                >
                                  <DropdownMenuLabel>
                                    Key actions
                                  </DropdownMenuLabel>
                                  <DropdownMenuItem
                                    className="rounded-sm"
                                    onClick={() =>
                                      copyToClipboard(key.key_string, key.id)
                                    }
                                  >
                                    <Copy className="size-4" />
                                    Copy token
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="rounded-sm"
                                    onClick={() => toggleKeyVisibility(key.id)}
                                  >
                                    {isVisible ? (
                                      <EyeOff className="size-4" />
                                    ) : (
                                      <Eye className="size-4" />
                                    )}
                                    {isVisible ? "Hide token" : "Reveal token"}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    className="rounded-sm"
                                    onClick={openCreateSheet}
                                  >
                                    <RefreshCw className="size-4" />
                                    Generate replacement
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="m-4 flex flex-col items-center justify-center rounded-2xl bg-muted/20 px-6 py-16 text-center">
                      <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-muted">
                        <KeyRound className="size-5 text-muted-foreground" />
                      </div>
                      <p className="font-medium">
                        {keys.length === 0
                          ? "No API keys have been issued yet"
                          : "No keys match your filters"}
                      </p>
                      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                        {keys.length === 0
                          ? "Generate a key to start connecting secure services."
                          : "Try a different search term or switch the token filter."}
                      </p>
                      <Button
                        className="mt-5 rounded-2xl"
                        onClick={openCreateSheet}
                        disabled={creating}
                      >
                        {creating ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Plus className="size-4" />
                        )}
                        Generate key
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
              <SheetContent
                side="right"
                className="rounded-l-sm rounded-r-none sm:max-w-md"
              >
                <form
                  className="flex h-full flex-col"
                  onSubmit={handleCreateKey}
                >
                  <SheetHeader>
                    <SheetTitle>Generate API key</SheetTitle>
                    <SheetDescription>
                      Name the key, choose Dev or Prod, and set whether it
                      expires.
                    </SheetDescription>
                  </SheetHeader>

                  <div className="flex flex-1 flex-col gap-5 px-6">
                    <div className="space-y-2">
                      <Label htmlFor="api-key-name">Key name</Label>
                      <Input
                        id="api-key-name"
                        className="rounded-sm"
                        placeholder="Production backend"
                        value={keyName}
                        onChange={(event) => setKeyName(event.target.value)}
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="api-key-environment">Environment</Label>
                      <Select
                        value={keyEnvironment}
                        onValueChange={(value) =>
                          setKeyEnvironment(
                            value as "development" | "production"
                          )
                        }
                      >
                        <SelectTrigger
                          id="api-key-environment"
                          className="w-full rounded-sm"
                        >
                          <SelectValue placeholder="Select environment" />
                        </SelectTrigger>
                        <SelectContent className="rounded-sm">
                          <SelectItem
                            className="rounded-sm"
                            value="development"
                          >
                            Dev
                          </SelectItem>
                          <SelectItem className="rounded-sm" value="production">
                            Prod
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-sm bg-muted/30 p-3">
                      <div className="space-y-1">
                        <Label htmlFor="api-key-expires">Expiry</Label>
                        <p className="text-xs text-muted-foreground">
                          {keyExpires ? "Yes" : "No"}
                        </p>
                      </div>
                      <Switch
                        id="api-key-expires"
                        checked={keyExpires}
                        onCheckedChange={handleExpiryChange}
                      />
                    </div>

                    {keyExpires && (
                      <div className="rounded-sm bg-muted/30 p-4">
                        <div className="mb-5 flex items-center justify-between">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-sm"
                            aria-label="Previous month"
                            onClick={() => moveCalendarMonth(-1)}
                          >
                            <ChevronLeft className="size-4" />
                          </Button>
                          <p className="text-sm font-medium">
                            {formatMonth(calendarMonth)}
                          </p>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-sm"
                            aria-label="Next month"
                            onClick={() => moveCalendarMonth(1)}
                          >
                            <ChevronRight className="size-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-center">
                          {WEEKDAY_LABELS.map((weekday) => (
                            <div
                              key={weekday}
                              className="py-1 text-xs font-medium text-muted-foreground"
                            >
                              {weekday}
                            </div>
                          ))}
                          {calendarDays.map((date) => {
                            const isCurrentMonth =
                              date.getMonth() === calendarMonth.getMonth()
                            const isSelected =
                              expiryDate &&
                              getDateKey(date) === getDateKey(expiryDate)

                            return (
                              <Button
                                key={getDateKey(date)}
                                type="button"
                                variant={isSelected ? "default" : "ghost"}
                                size="icon-sm"
                                className="rounded-sm"
                                onClick={() => setExpiryDate(date)}
                              >
                                <span
                                  className={
                                    isCurrentMonth
                                      ? "text-sm"
                                      : "text-sm text-muted-foreground"
                                  }
                                >
                                  {date.getDate()}
                                </span>
                              </Button>
                            )
                          })}
                        </div>

                        {expiryDate && (
                          <p className="mt-4 text-xs text-muted-foreground">
                            Expires on {formatDate(expiryDate.toISOString())}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <SheetFooter>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-sm"
                      onClick={() => setCreateSheetOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      className="rounded-sm"
                      disabled={creating || !keyName.trim()}
                    >
                      {creating ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                      Generate key
                    </Button>
                  </SheetFooter>
                </form>
              </SheetContent>
            </Sheet>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
