"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Check,
  ChevronRight,
  CreditCard,
  Database,
  Download,
  KeyRound,
  List,
  Loader2,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sun,
  Zap,
  Wallet,
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

type ApiKeyRecord = {
  id: string
  created_at?: string | null
}

type LedgerEntry = {
  id: string
  activity: string
  units: string
  amount: string
  happenedAt: string
  status: "posted" | "processing"
}

type PayoutCurrency = "USD" | "EUR" | "INR"
type PaymentMethod = "upi" | "card"

const LOCAL_API_KEYS_STORAGE_PREFIX = "cosavu:api-keys"
const PAYOUT_RATE_FROM_USD: Record<PayoutCurrency, number> = {
  USD: 1,
  EUR: 0.92,
  INR: 83.25,
}

const UPI_QR_SIZE = 21

function buildPseudoQrMatrix(size: number) {
  const matrix = Array.from({ length: size }, () =>
    Array.from({ length: size }, () => false)
  )

  const addFinder = (top: number, left: number) => {
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 7; col++) {
        const isOuterRing = row === 0 || row === 6 || col === 0 || col === 6
        const isInnerSquare = row >= 2 && row <= 4 && col >= 2 && col <= 4
        matrix[top + row][left + col] = isOuterRing || isInnerSquare
      }
    }
  }

  addFinder(0, 0)
  addFinder(0, size - 7)
  addFinder(size - 7, 0)

  for (let index = 8; index < size - 8; index++) {
    matrix[6][index] = index % 2 === 0
    matrix[index][6] = index % 2 === 0
  }

  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      if (matrix[row][col]) continue

      const insideFinderQuietZone =
        (row < 8 && col < 8) ||
        (row < 8 && col >= size - 8) ||
        (row >= size - 8 && col < 8)
      if (insideFinderQuietZone) continue

      const seed = (row * 31 + col * 17 + row * col * 7 + 19) % 11
      matrix[row][col] = seed === 0 || seed === 3 || seed === 7
    }
  }

  return matrix
}

const PAYOUT_CURRENCY_OPTIONS: Record<
  PayoutCurrency,
  { label: string; locale: string; currency: string }
> = {
  USD: {
    label: "USD — United States Dollar",
    locale: "en-US",
    currency: "USD",
  },
  EUR: {
    label: "EUR — Euro",
    locale: "de-DE",
    currency: "EUR",
  },
  INR: {
    label: "INR — Indian Rupee",
    locale: "en-IN",
    currency: "INR",
  },
}

function getLocalApiKeysStorageKey(email?: string | null) {
  return `${LOCAL_API_KEYS_STORAGE_PREFIX}:${email?.toLowerCase() || "unknown"}`
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

    return parsedKeys
      .filter((key): key is ApiKeyRecord => Boolean(key?.id))
      .sort((left, right) => {
        const leftTime = left.created_at
          ? new Date(left.created_at).getTime()
          : 0
        const rightTime = right.created_at
          ? new Date(right.created_at).getTime()
          : 0
        return rightTime - leftTime
      })
  } catch {
    return []
  }
}

function formatDate(value?: string | null) {
  if (!value) return "None"
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

export default function BillingPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<ConsoleUser | null>(null)
  const [activeKeys, setActiveKeys] = useState(0)
  const [latestIssued, setLatestIssued] = useState<string | null>(null)
  const [usageStats, setUsageStats] =
    useState<ConsoleStats>(EMPTY_CONSOLE_STATS)
  const [billingEmail, setBillingEmail] = useState("")
  const [monthlySoftCap, setMonthlySoftCap] = useState("150")
  const [hardCapEnabled, setHardCapEnabled] = useState(true)
  const [allowOverage, setAllowOverage] = useState(false)
  const [payoutModalOpen, setPayoutModalOpen] = useState(false)
  const [payoutCurrency, setPayoutCurrency] = useState<PayoutCurrency>("USD")
  const [payoutNotes, setPayoutNotes] = useState("")
  const [savingPayout, setSavingPayout] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("card")
  const [upiModalOpen, setUpiModalOpen] = useState(false)

  useEffect(() => {
    const unsubscribe = watchConsoleAuth(async (currentUser) => {
      if (!currentUser) {
        router.push("/login")
        return
      }

      setUser(currentUser)
      setBillingEmail(currentUser.email || "")

      const localKeys = readLocalApiKeys(currentUser.email)
      setActiveKeys(localKeys.length)
      setLatestIssued(localKeys[0]?.created_at ?? null)

      try {
        const liveStats = await fetchConsoleStats(currentUser.email)
        const mergedStats = mergeConsoleStats(liveStats, {
          activeKeys: localKeys.length,
          latestIssue: localKeys[0]?.created_at,
        })
        setUsageStats(mergedStats)
        setActiveKeys(mergedStats.activeKeys)
        setLatestIssued(mergedStats.latestIssue)
      } catch {
        setUsageStats(EMPTY_CONSOLE_STATS)
      }

      // Stripe Feedback
      const params = new URLSearchParams(window.location.search)
      if (params.get("success")) {
        alert("Payment successful! Your credits have been updated.")
        // In a real app, you'd trigger a refresh of the user's balance here.
      } else if (params.get("canceled")) {
        alert("Payment canceled.")
      }

      setLoading(false)
    })

    return () => unsubscribe()
  }, [router])

  const estimatedSpend = usageStats.currentBillUsd
  const ledgerEntries = usageStats.ledger as LedgerEntry[]
  const requestPercent = usageStats.monthlyUsagePercent ?? 0
  const requestLabel =
    usageStats.requestsUsed != null && usageStats.requestLimit != null
      ? `${usageStats.requestsUsed.toLocaleString()} / ${usageStats.requestLimit.toLocaleString()}`
      : "No metered requests reported"
  const tokenSavingsPercent = usageStats.tokenSavingsPercent ?? 0
  const tokensBeforeFilter = usageStats.tokensBeforeFilter
  const tokensSaved = usageStats.tokensSaved

  const billedAmountLabel = useMemo(() => {
    const currency = PAYOUT_CURRENCY_OPTIONS[payoutCurrency]
    const convertedAmount =
      estimatedSpend * PAYOUT_RATE_FROM_USD[payoutCurrency]

    return new Intl.NumberFormat(currency.locale, {
      style: "currency",
      currency: currency.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(convertedAmount)
  }, [estimatedSpend, payoutCurrency])

  const upiQrMatrix = useMemo(() => buildPseudoQrMatrix(UPI_QR_SIZE), [])

  const refreshMetering = () => {
    setRefreshing(true)

    const localKeys = readLocalApiKeys(user?.email)
    fetchConsoleStats(user?.email)
      .then((liveStats) => {
        const mergedStats = mergeConsoleStats(liveStats, {
          activeKeys: localKeys.length,
          latestIssue: localKeys[0]?.created_at,
        })
        setUsageStats(mergedStats)
        setActiveKeys(mergedStats.activeKeys)
        setLatestIssued(mergedStats.latestIssue)
      })
      .catch(() => {
        setUsageStats(EMPTY_CONSOLE_STATS)
        setActiveKeys(localKeys.length)
        setLatestIssued(localKeys[0]?.created_at ?? null)
      })
      .finally(() => setRefreshing(false))
  }

  const saveControls = () => {
    setSaving(true)
    window.setTimeout(() => setSaving(false), 900)
  }

  const checkoutBill = async () => {
    if (paymentMethod === "upi") {
      setPayoutModalOpen(false)
      setUpiModalOpen(true)
      return
    }

    setSavingPayout(true)
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: estimatedSpend * PAYOUT_RATE_FROM_USD[payoutCurrency],
          currency: payoutCurrency,
          email: user?.email,
        }),
      })

      const { url, error } = await response.json()

      if (error) {
        throw new Error(error)
      }

      if (url) {
        window.location.href = url
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unable to start checkout."

      console.error("Checkout failed:", error)
      alert("Checkout failed: " + message)
    } finally {
      setSavingPayout(false)
      setPayoutModalOpen(false)
    }
  }

  const openUpiPayment = () => {
    setPaymentMethod("upi")
    setUpiModalOpen(true)
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
              <Skeleton className="h-40 w-full" />
              <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
                <Skeleton className="h-96 w-full" />
                <Skeleton className="h-96 w-full" />
              </div>
              <Skeleton className="h-64 w-full" />
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
                <BreadcrumbItem>Workspace</BreadcrumbItem>
                <BreadcrumbSeparator>
                  <ChevronRight className="size-3.5" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbPage>Billing</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Refresh billing data"
                    disabled={refreshing}
                    onClick={refreshMetering}
                  >
                    <RefreshCw
                      className={refreshing ? "size-4 animate-spin" : "size-4"}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh metering</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Toggle theme"
                    onClick={() =>
                      setTheme(theme === "dark" ? "light" : "dark")
                    }
                  >
                    {theme === "dark" ? (
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
                      Usage-based billing
                    </Badge>
                    <Badge
                      className="w-fit rounded-sm font-mono"
                      variant="outline"
                    >
                      {COSAVU_ENDPOINTS.stan.optimize}
                    </Badge>
                    <Badge
                      className="w-fit rounded-sm font-mono"
                      variant="outline"
                    >
                      {COSAVU_ENDPOINTS.data.query}
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl font-semibold tracking-tight md:text-3xl">
                    Billing and metering
                  </CardTitle>
                  <CardDescription className="max-w-2xl">
                    Cosavu uses tenant-scoped metering from API calls, prompt
                    optimization, and indexing activity. No fixed subscription
                    plans are configured.
                  </CardDescription>
                </div>
                <CardAction className="col-span-full col-start-1 row-start-2 flex flex-wrap items-center gap-2 justify-self-start md:col-span-1 md:col-start-2 md:row-start-1 md:justify-self-end">
                  <Button variant="outline" onClick={refreshMetering}>
                    <RefreshCw className="size-4" />
                    Sync usage
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setPayoutModalOpen(true)}
                  >
                    <Wallet className="size-4" />
                    Checkout bill
                  </Button>
                  <Button variant="outline">
                    <Download className="size-4" />
                    Export ledger
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-sm bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">Model</p>
                    <p className="mt-2 text-xl font-semibold">Metered usage</p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">Active keys</p>
                    <p className="mt-2 text-xl font-semibold">{activeKeys}</p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">
                      Latest issue
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {formatDate(latestIssued)}
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <p className="text-sm text-muted-foreground">
                      Monthly usage
                    </p>
                    <p className="mt-2 text-xl font-semibold">
                      {usageStats.monthlyUsagePercent == null
                        ? "No usage"
                        : `${usageStats.monthlyUsagePercent}%`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">Usage controls</CardTitle>
                  <CardDescription>
                    Configure alerts and hard caps for tenant-level consumption.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="billing-email">Billing contact</Label>
                      <Input
                        id="billing-email"
                        placeholder="billing@company.com"
                        value={billingEmail}
                        onChange={(event) =>
                          setBillingEmail(event.target.value)
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="soft-cap">Monthly soft cap (USD)</Label>
                      <Input
                        id="soft-cap"
                        inputMode="numeric"
                        placeholder="150"
                        value={monthlySoftCap}
                        onChange={(event) =>
                          setMonthlySoftCap(event.target.value)
                        }
                      />
                    </div>
                  </div>

                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-medium">Hard cap enforcement</p>
                        <p className="text-sm text-muted-foreground">
                          Stop new calls when the soft cap is crossed.
                        </p>
                      </div>
                      <Switch
                        checked={hardCapEnabled}
                        onCheckedChange={setHardCapEnabled}
                      />
                    </div>
                  </div>

                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-medium">Allow overage processing</p>
                        <p className="text-sm text-muted-foreground">
                          Continue serving traffic and post usage to the next
                          cycle.
                        </p>
                      </div>
                      <Switch
                        checked={allowOverage}
                        onCheckedChange={setAllowOverage}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-sm bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <p className="font-medium">Payment methods</p>
                        <p className="text-sm text-muted-foreground">
                          Choose the default payout route for this workspace.
                        </p>
                      </div>
                      <Badge className="rounded-sm" variant="secondary">
                        Active
                      </Badge>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button
                        variant={
                          paymentMethod === "upi" ? "default" : "outline"
                        }
                        className="justify-start"
                        onClick={openUpiPayment}
                      >
                        <Wallet className="size-4" />
                        UPI
                        {paymentMethod === "upi" ? (
                          <Check className="ml-auto size-4" />
                        ) : null}
                      </Button>
                      <Button
                        variant={
                          paymentMethod === "card" ? "default" : "outline"
                        }
                        className="justify-start"
                        onClick={() => {
                          setPaymentMethod("card")
                          setUpiModalOpen(false)
                        }}
                      >
                        <CreditCard className="size-4" />
                        Card - Credit / Debit
                        {paymentMethod === "card" ? (
                          <Check className="ml-auto size-4" />
                        ) : null}
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-4 rounded-sm bg-muted/30 p-4">
                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          API calls
                        </p>
                        <p className="text-sm font-semibold">{requestLabel}</p>
                      </div>
                      <Progress value={requestPercent} className="h-2" />
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          Token reduction (Engram)
                        </p>
                        <p className="text-sm font-semibold">
                          {usageStats.tokenSavingsPercent == null
                            ? "No data"
                            : `${usageStats.tokenSavingsPercent}%`}
                        </p>
                      </div>
                      <Progress value={tokenSavingsPercent} className="h-2" />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Tokens before filter
                        </p>
                        <p className="mt-1 text-lg font-semibold">
                          {tokensBeforeFilter == null
                            ? "No data"
                            : tokensBeforeFilter.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">
                          Tokens saved
                        </p>
                        <p className="mt-1 text-lg font-semibold">
                          {tokensSaved == null
                            ? "No data"
                            : tokensSaved.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    className="w-full sm:w-auto"
                    disabled={saving || !billingEmail.trim()}
                    onClick={saveControls}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="size-4" />
                    )}
                    Save controls
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-xl">Pipeline breakdown</CardTitle>
                  <CardDescription>
                    Tier mix and data infrastructure signals from current
                    activity.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-3 rounded-sm bg-muted/30 p-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">Metered requests</p>
                        <p className="text-sm text-muted-foreground">
                          {requestLabel}
                        </p>
                      </div>
                      <Progress value={requestPercent} className="h-2" />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">Token savings</p>
                        <p className="text-sm text-muted-foreground">
                          {usageStats.tokenSavingsPercent == null
                            ? "No data"
                            : `${usageStats.tokenSavingsPercent}%`}
                        </p>
                      </div>
                      <Progress value={tokenSavingsPercent} className="h-2" />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-sm bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Database className="size-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Indexed chunks
                        </p>
                      </div>
                      <p className="font-semibold">
                        {usageStats.chunksIndexed.toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Zap className="size-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Connected warehouses
                        </p>
                      </div>
                      <p className="font-semibold">
                        {usageStats.connectedWarehouses}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <List className="size-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Files synced
                        </p>
                      </div>
                      <p className="font-semibold">{usageStats.filesSynced}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {paymentMethod === "upi" ? (
                          <Wallet className="size-4 text-muted-foreground" />
                        ) : (
                          <CreditCard className="size-4 text-muted-foreground" />
                        )}
                        <p className="text-sm text-muted-foreground">
                          Payment method
                        </p>
                      </div>
                      <p className="font-semibold">
                        {paymentMethod === "upi"
                          ? "UPI"
                          : "Card - Credit / Debit"}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <KeyRound className="size-4 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          Billing owner
                        </p>
                      </div>
                      <p className="max-w-[60%] truncate text-right font-semibold">
                        {user?.email || "Not available"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-sm border-border/60 shadow-sm">
              <CardHeader className="gap-3">
                <CardTitle className="text-xl">Metering ledger</CardTitle>
                <CardDescription>
                  Cost entries from query, optimization, and indexing events.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {ledgerEntries.length === 0 && (
                  <div className="rounded-sm bg-muted/20 p-4 text-sm text-muted-foreground">
                    No ledger entries have been reported for this key yet.
                  </div>
                )}
                {ledgerEntries.map((entry, index) => (
                  <div key={entry.id}>
                    {index > 0 && <Separator className="mb-3" />}
                    <div className="flex flex-col gap-3 rounded-sm bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{entry.activity}</p>
                        <p className="text-sm text-muted-foreground">
                          {entry.id} • {formatDate(entry.happenedAt)}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <p className="text-sm text-muted-foreground">
                          {entry.units}
                        </p>
                        <Badge
                          className="rounded-sm capitalize"
                          variant={
                            entry.status === "posted" ? "secondary" : "outline"
                          }
                        >
                          {entry.status}
                        </Badge>
                        <p className="min-w-20 text-right font-semibold">
                          {entry.amount}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </main>

          <Sheet open={payoutModalOpen} onOpenChange={setPayoutModalOpen}>
            <SheetContent
              side="top"
              className="top-1/2 left-1/2 h-auto w-[min(92vw,430px)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-card p-0 data-[side=top]:top-1/2 data-[side=top]:right-auto data-[side=top]:bottom-auto data-[side=top]:left-1/2 data-[side=top]:border-b data-[side=top]:slide-in-from-top-4"
            >
              <div className="max-h-[90vh] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Checkout Bill</SheetTitle>
                  <SheetDescription>
                    Pay metered usage using your active payment method.
                  </SheetDescription>
                </SheetHeader>

                <div className="space-y-5 px-6 pb-6">
                  <div className="space-y-2">
                    <Label htmlFor="payout-currency">Preferred Currency</Label>
                    <Select
                      value={payoutCurrency}
                      onValueChange={(value) =>
                        setPayoutCurrency(value as PayoutCurrency)
                      }
                    >
                      <SelectTrigger id="payout-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-sm">
                        {Object.entries(PAYOUT_CURRENCY_OPTIONS).map(
                          ([value, option]) => (
                            <SelectItem
                              key={value}
                              value={value}
                              className="rounded-sm"
                            >
                              {option.label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <Label>Amount to pay</Label>
                      <p className="text-4xl font-semibold tracking-tight">
                        {billedAmountLabel}
                      </p>
                    </div>
                    <div className="rounded-sm bg-muted/30 p-3 text-sm text-muted-foreground">
                      {paymentMethod === "upi"
                        ? "This amount will be paid via UPI after QR confirmation."
                        : "This amount will be charged to Card - Credit / Debit."}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="payout-notes">Notes</Label>
                    <textarea
                      id="payout-notes"
                      value={payoutNotes}
                      onChange={(event) => setPayoutNotes(event.target.value)}
                      placeholder="Add any notes for this payout configuration..."
                      className="min-h-28 w-full resize-none rounded-sm border-0 bg-input/50 px-3 py-2 text-sm text-foreground ring-0 outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/30"
                    />
                  </div>

                  <Button
                    onClick={checkoutBill}
                    className="w-full"
                    disabled={savingPayout}
                  >
                    {savingPayout ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    {paymentMethod === "upi"
                      ? `Continue to UPI (${billedAmountLabel})`
                      : `Pay ${billedAmountLabel}`}
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>

          <Sheet open={upiModalOpen} onOpenChange={setUpiModalOpen}>
            <SheetContent
              side="top"
              className="top-1/2 left-1/2 h-auto w-[min(92vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-sm border border-border bg-card p-0 data-[side=top]:top-1/2 data-[side=top]:right-auto data-[side=top]:bottom-auto data-[side=top]:left-1/2 data-[side=top]:border-b data-[side=top]:slide-in-from-top-4"
            >
              <div className="space-y-5 px-6 pt-14 pb-6">
                <div className="mx-auto w-fit rounded-sm border border-border/70 bg-background p-3">
                  <div className="size-[220px] rounded-sm border border-border/70 bg-white p-2">
                    <div className="grid size-full grid-cols-[repeat(21,minmax(0,1fr))] gap-px bg-white">
                      {upiQrMatrix.map((row, rowIndex) =>
                        row.map((cell, colIndex) => (
                          <span
                            key={`${rowIndex}-${colIndex}`}
                            className={cell ? "bg-black" : "bg-white"}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2 text-center">
                  <p className="text-2xl font-semibold tracking-tight">
                    Scan to pay
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Open your UPI app and scan this code to pay{" "}
                    {billedAmountLabel}.
                  </p>
                </div>

                <Button
                  className="w-full"
                  onClick={() => setUpiModalOpen(false)}
                >
                  I have paid
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
