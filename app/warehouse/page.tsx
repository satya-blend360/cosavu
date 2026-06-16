"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Check,
  ChevronRight,
  Cloud,
  Copy,
  Database,
  HardDrive,
  KeyRound,
  Loader2,
  Moon,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  Unplug,
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
import { COSAVU_ENDPOINTS } from "@/lib/cosavu-api"
import { watchConsoleAuth, type ConsoleUser } from "@/lib/console-auth"
import { isDemoStatsUser } from "@/lib/console-stats"

type WarehouseProvider = "aws-s3" | "gcp-storage"
type WarehouseStatus = "connected" | "syncing" | "attention" | "paused"
type RetrievalSystem = "car-0" | "car-1"
type SyncRunStatus = "completed" | "running" | "failed" | "queued"

type WarehouseConnection = {
  id: string
  name: string
  provider: WarehouseProvider
  uri: string
  prefix: string
  region: string
  system: RetrievalSystem
  status: WarehouseStatus
  ownerEmail: string
  createdAt: string
  lastSyncAt: string | null
  nextSyncAt: string | null
  filesIndexed: number
  objectsScanned: number
  totalBytes: number
  chunksIndexed: number
  credentialLabel: string
  autoSync: boolean
}

type SyncRun = {
  id: string
  warehouseId: string
  startedAt: string
  finishedAt: string | null
  status: SyncRunStatus
  filesProcessed: number
  filesSkipped: number
  chunksIndexed: number
  message: string
}

const LOCAL_WAREHOUSE_STORAGE_PREFIX = "cosavu:warehouses"
const LOCAL_WAREHOUSE_RUNS_STORAGE_PREFIX = "cosavu:warehouse-runs"
const SEEDED_WAREHOUSE_IDS = new Set([
  "warehouse-product-s3",
  "warehouse-gcp-research",
  "warehouse-archive-s3",
])
const SEEDED_WAREHOUSE_RUN_IDS = new Set([
  "run-product-0421",
  "run-research-0421",
  "run-archive-0420",
])

const PROVIDER_LABELS: Record<WarehouseProvider, string> = {
  "aws-s3": "AWS S3",
  "gcp-storage": "GCP Storage",
}

const STATUS_LABELS: Record<WarehouseStatus, string> = {
  connected: "Connected",
  syncing: "Syncing",
  attention: "Needs attention",
  paused: "Paused",
}

const RUN_STATUS_LABELS: Record<SyncRunStatus, string> = {
  completed: "Completed",
  running: "Running",
  failed: "Failed",
  queued: "Queued",
}

const REGION_OPTIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
  { value: "global", label: "Global" },
]

function getWarehouseStorageKey(email?: string | null) {
  return `${LOCAL_WAREHOUSE_STORAGE_PREFIX}:${email?.toLowerCase() || "unknown"}`
}

function getWarehouseRunsStorageKey(email?: string | null) {
  return `${LOCAL_WAREHOUSE_RUNS_STORAGE_PREFIX}:${email?.toLowerCase() || "unknown"}`
}

function formatBytes(bytes: number) {
  if (bytes === 0) return "0 B"

  const units = ["B", "KB", "MB", "GB", "TB"]
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )

  return `${(bytes / 1024 ** unitIndex).toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

function formatDate(value?: string | null) {
  if (!value) return "Not synced"

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value)
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }

  return `${prefix}-${Date.now().toString(36)}`
}

function readLocalWarehouses(email?: string | null) {
  if (typeof window === "undefined") return []

  try {
    const storedWarehouses = window.localStorage.getItem(
      getWarehouseStorageKey(email)
    )
    if (!storedWarehouses) return []

    const parsedWarehouses = JSON.parse(storedWarehouses)
    if (!Array.isArray(parsedWarehouses)) return []

    return parsedWarehouses.filter(
      (warehouse): warehouse is WarehouseConnection => {
        return Boolean(
          warehouse?.id &&
          warehouse?.name &&
          warehouse?.uri &&
          !SEEDED_WAREHOUSE_IDS.has(warehouse.id)
        )
      }
    )
  } catch {
    return []
  }
}

function readLocalSyncRuns(email?: string | null) {
  if (typeof window === "undefined") return []

  try {
    const storedRuns = window.localStorage.getItem(
      getWarehouseRunsStorageKey(email)
    )
    if (!storedRuns) return []

    const parsedRuns = JSON.parse(storedRuns)
    if (!Array.isArray(parsedRuns)) return []

    return parsedRuns.filter((run): run is SyncRun => {
      return Boolean(
        run?.id &&
        run?.warehouseId &&
        run?.startedAt &&
        !SEEDED_WAREHOUSE_RUN_IDS.has(run.id) &&
        !SEEDED_WAREHOUSE_IDS.has(run.warehouseId)
      )
    })
  } catch {
    return []
  }
}

function saveLocalWarehouses(
  email: string | null | undefined,
  warehouses: WarehouseConnection[]
) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(
    getWarehouseStorageKey(email),
    JSON.stringify(warehouses)
  )
}

function saveLocalSyncRuns(email: string | null | undefined, runs: SyncRun[]) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(
    getWarehouseRunsStorageKey(email),
    JSON.stringify(runs)
  )
}

function createDefaultWarehouseState(email?: string | null) {
  if (!isDemoStatsUser(email)) {
    return { warehouses: [], runs: [] } satisfies {
      warehouses: WarehouseConnection[]
      runs: SyncRun[]
    }
  }

  const now = new Date().toISOString()
  const ownerEmail = email || "workspace@cosavu.com"

  const warehouses: WarehouseConnection[] = [
    {
      id: "demo-warehouse-global-s3",
      name: "Global production lake",
      provider: "aws-s3",
      uri: "s3://cosavu-demo-million-scale/",
      prefix: "prod/",
      region: "us-east-1",
      system: "car-0",
      status: "connected",
      ownerEmail,
      createdAt: now,
      lastSyncAt: now,
      nextSyncAt: now,
      filesIndexed: 64_820_453,
      objectsScanned: 128_991_247,
      totalBytes: 8_420_681_493_217_389,
      chunksIndexed: 984_220_137,
      credentialLabel: "arn:aws:iam::demo:role/cosavu-million-reader",
      autoSync: true,
    },
    {
      id: "demo-warehouse-apac-gcs",
      name: "APAC retrieval mirror",
      provider: "gcp-storage",
      uri: "gs://cosavu-demo-apac-mirror/",
      prefix: "retrieval/",
      region: "global",
      system: "car-1",
      status: "syncing",
      ownerEmail,
      createdAt: now,
      lastSyncAt: now,
      nextSyncAt: now,
      filesIndexed: 18_730_219,
      objectsScanned: 41_200_137,
      totalBytes: 2_180_319_847_562_913,
      chunksIndexed: 342_880_417,
      credentialLabel: "cosavu-million-indexer@demo.iam.gserviceaccount.com",
      autoSync: true,
    },
  ]

  const runs: SyncRun[] = [
    {
      id: "demo-run-global-s3",
      warehouseId: "demo-warehouse-global-s3",
      startedAt: now,
      finishedAt: now,
      status: "completed",
      filesProcessed: 7_820_319,
      filesSkipped: 42_137,
      chunksIndexed: 184_220_139,
      message: "Million-scale sync completed",
    },
    {
      id: "demo-run-apac-gcs",
      warehouseId: "demo-warehouse-apac-gcs",
      startedAt: now,
      finishedAt: null,
      status: "running",
      filesProcessed: 3_280_411,
      filesSkipped: 18_119,
      chunksIndexed: 88_400_233,
      message: "High-volume mirror scan running",
    },
  ]

  return { warehouses, runs }
}

function getStatusVariant(status: WarehouseStatus) {
  if (status === "connected") return "secondary"
  if (status === "syncing" || status === "paused") return "outline"

  return "destructive"
}

function getRunVariant(status: SyncRunStatus) {
  if (status === "completed") return "secondary"
  if (status === "running" || status === "queued") return "outline"

  return "destructive"
}

function getProviderIcon(provider: WarehouseProvider) {
  return provider === "aws-s3" ? Cloud : Database
}

export default function WarehousePage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [setupSheetOpen, setSetupSheetOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [user, setUser] = useState<ConsoleUser | null>(null)
  const [warehouses, setWarehouses] = useState<WarehouseConnection[]>([])
  const [syncRuns, setSyncRuns] = useState<SyncRun[]>([])
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(
    null
  )
  const [searchQuery, setSearchQuery] = useState("")
  const [providerFilter, setProviderFilter] = useState("all")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warehouseName, setWarehouseName] = useState("")
  const [warehouseProvider, setWarehouseProvider] =
    useState<WarehouseProvider>("aws-s3")
  const [warehouseUri, setWarehouseUri] = useState("")
  const [warehousePrefix, setWarehousePrefix] = useState("")
  const [warehouseRegion, setWarehouseRegion] = useState("us-east-1")
  const [warehouseSystem, setWarehouseSystem] =
    useState<RetrievalSystem>("car-0")
  const [credentialLabel, setCredentialLabel] = useState("")
  const [autoSync, setAutoSync] = useState(true)

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

      const storedWarehouses = readLocalWarehouses(currentUser.email)
      const storedRuns = readLocalSyncRuns(currentUser.email)
      const defaults = createDefaultWarehouseState(currentUser.email)
      const shouldMergeDemo = isDemoStatsUser(currentUser.email)
      const nextWarehouses = shouldMergeDemo
        ? [
            ...defaults.warehouses,
            ...storedWarehouses.filter(
              (warehouse) =>
                !defaults.warehouses.some((demo) => demo.id === warehouse.id)
            ),
          ]
        : storedWarehouses.length > 0
          ? storedWarehouses
          : defaults.warehouses
      const nextRuns = shouldMergeDemo
        ? [
            ...defaults.runs,
            ...storedRuns.filter(
              (run) => !defaults.runs.some((demo) => demo.id === run.id)
            ),
          ]
        : storedRuns.length > 0
          ? storedRuns
          : defaults.runs

      if (shouldMergeDemo || storedWarehouses.length === 0) {
        saveLocalWarehouses(currentUser.email, nextWarehouses)
      }

      if (shouldMergeDemo || storedRuns.length === 0) {
        saveLocalSyncRuns(currentUser.email, nextRuns)
      }

      setUser(currentUser)
      setWarehouses(nextWarehouses)
      setSyncRuns(nextRuns)
      setSelectedWarehouseId(nextWarehouses[0]?.id ?? null)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [router])

  const selectedWarehouse = useMemo(() => {
    return (
      warehouses.find((warehouse) => warehouse.id === selectedWarehouseId) ||
      warehouses[0]
    )
  }, [selectedWarehouseId, warehouses])

  const selectedRuns = useMemo(() => {
    if (!selectedWarehouse) return []

    return syncRuns.filter((run) => run.warehouseId === selectedWarehouse.id)
  }, [selectedWarehouse, syncRuns])

  const filteredWarehouses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return warehouses.filter((warehouse) => {
      const matchesProvider =
        providerFilter === "all" || warehouse.provider === providerFilter
      const matchesQuery =
        !query ||
        warehouse.name.toLowerCase().includes(query) ||
        warehouse.uri.toLowerCase().includes(query) ||
        warehouse.prefix.toLowerCase().includes(query)

      return matchesProvider && matchesQuery
    })
  }, [providerFilter, searchQuery, warehouses])

  const stats = useMemo(() => {
    const totalBytes = warehouses.reduce(
      (sum, warehouse) => sum + warehouse.totalBytes,
      0
    )
    const totalChunks = warehouses.reduce(
      (sum, warehouse) => sum + warehouse.chunksIndexed,
      0
    )
    const objectsScanned = warehouses.reduce(
      (sum, warehouse) => sum + warehouse.objectsScanned,
      0
    )
    const activeSyncs = warehouses.filter(
      (warehouse) => warehouse.status === "syncing"
    ).length

    return {
      totalBytes,
      totalChunks,
      objectsScanned,
      activeSyncs,
    }
  }, [warehouses])

  const refreshWarehouses = () => {
    setRefreshing(true)
    const storedWarehouses = readLocalWarehouses(user?.email)
    const storedRuns = readLocalSyncRuns(user?.email)

    if (isDemoStatsUser(user?.email)) {
      const defaults = createDefaultWarehouseState(user?.email)
      const nextWarehouses = [
        ...defaults.warehouses,
        ...storedWarehouses.filter(
          (warehouse) =>
            !defaults.warehouses.some((demo) => demo.id === warehouse.id)
        ),
      ]
      const nextRuns = [
        ...defaults.runs,
        ...storedRuns.filter(
          (run) => !defaults.runs.some((demo) => demo.id === run.id)
        ),
      ]

      saveLocalWarehouses(user?.email, nextWarehouses)
      saveLocalSyncRuns(user?.email, nextRuns)
      setWarehouses(nextWarehouses)
      setSyncRuns(nextRuns)
      setSelectedWarehouseId((currentId) => currentId || nextWarehouses[0]?.id)
      window.setTimeout(() => setRefreshing(false), 650)
      return
    }

    if (storedWarehouses.length > 0) {
      setWarehouses(storedWarehouses)
      setSelectedWarehouseId(
        (currentId) => currentId || storedWarehouses[0]?.id
      )
    }

    if (storedRuns.length > 0) {
      setSyncRuns(storedRuns)
    }

    window.setTimeout(() => setRefreshing(false), 650)
  }

  const openSetupSheet = () => {
    setErrorMessage(null)
    setWarehouseName("")
    setWarehouseProvider("aws-s3")
    setWarehouseUri("")
    setWarehousePrefix("")
    setWarehouseRegion("us-east-1")
    setWarehouseSystem("car-0")
    setCredentialLabel("")
    setAutoSync(true)
    setSetupSheetOpen(true)
  }

  const createWarehouse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = warehouseName.trim()
    const uri = warehouseUri.trim()
    const prefix = warehousePrefix.trim()
    const credential = credentialLabel.trim()

    if (!name || !uri || !credential) {
      setErrorMessage("Add a name, source URI, and credential reference.")
      return
    }

    if (
      warehouseProvider === "aws-s3" &&
      !uri.toLowerCase().startsWith("s3://")
    ) {
      setErrorMessage("AWS S3 sources must start with s3://")
      return
    }

    if (
      warehouseProvider === "gcp-storage" &&
      !uri.toLowerCase().startsWith("gs://")
    ) {
      setErrorMessage("GCP Storage sources must start with gs://")
      return
    }

    setSaving(true)
    setErrorMessage(null)

    const now = new Date().toISOString()
    const warehouseId = makeId("warehouse")
    const createdWarehouse: WarehouseConnection = {
      id: warehouseId,
      name,
      provider: warehouseProvider,
      uri,
      prefix,
      region: warehouseRegion,
      system: warehouseSystem,
      status: "syncing",
      ownerEmail: user?.email || "workspace@cosavu.com",
      createdAt: now,
      lastSyncAt: now,
      nextSyncAt: autoSync
        ? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
        : null,
      filesIndexed: 0,
      objectsScanned: 0,
      totalBytes: 0,
      chunksIndexed: 0,
      credentialLabel: credential,
      autoSync,
    }
    const createdRun: SyncRun = {
      id: makeId("run"),
      warehouseId,
      startedAt: now,
      finishedAt: null,
      status: "queued",
      filesProcessed: 0,
      filesSkipped: 0,
      chunksIndexed: 0,
      message: "Initial warehouse sync queued",
    }
    const nextWarehouses = [createdWarehouse, ...warehouses]
    const nextRuns = [createdRun, ...syncRuns]

    saveLocalWarehouses(user?.email, nextWarehouses)
    saveLocalSyncRuns(user?.email, nextRuns)

    window.setTimeout(() => {
      setWarehouses(nextWarehouses)
      setSyncRuns(nextRuns)
      setSelectedWarehouseId(warehouseId)
      setSaving(false)
      setSetupSheetOpen(false)
    }, 650)
  }

  const syncWarehouse = (warehouseId: string) => {
    const target = warehouses.find((warehouse) => warehouse.id === warehouseId)
    if (!target) return

    setSyncingId(warehouseId)
    setErrorMessage(null)

    const now = new Date().toISOString()
    const filesProcessed = Math.max(8, Math.round(target.filesIndexed * 0.08))
    const chunksIndexed = Math.max(120, Math.round(target.chunksIndexed * 0.06))
    const newRun: SyncRun = {
      id: makeId("run"),
      warehouseId,
      startedAt: now,
      finishedAt: null,
      status: "running",
      filesProcessed,
      filesSkipped: 3,
      chunksIndexed,
      message: "Manual sync in progress",
    }
    const syncingWarehouses = warehouses.map((warehouse) =>
      warehouse.id === warehouseId
        ? {
            ...warehouse,
            status: "syncing" as WarehouseStatus,
            lastSyncAt: now,
          }
        : warehouse
    )
    const queuedRuns = [newRun, ...syncRuns]

    setWarehouses(syncingWarehouses)
    setSyncRuns(queuedRuns)
    saveLocalWarehouses(user?.email, syncingWarehouses)
    saveLocalSyncRuns(user?.email, queuedRuns)

    window.setTimeout(() => {
      const finishedAt = new Date().toISOString()
      const completedWarehouses = syncingWarehouses.map((warehouse) =>
        warehouse.id === warehouseId
          ? {
              ...warehouse,
              status: "connected" as WarehouseStatus,
              lastSyncAt: finishedAt,
              nextSyncAt: warehouse.autoSync
                ? new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
                : null,
              filesIndexed: warehouse.filesIndexed + filesProcessed,
              objectsScanned: warehouse.objectsScanned + filesProcessed + 3,
              chunksIndexed: warehouse.chunksIndexed + chunksIndexed,
              totalBytes: warehouse.totalBytes + filesProcessed * 18_000_000,
            }
          : warehouse
      )
      const completedRuns = queuedRuns.map((run) =>
        run.id === newRun.id
          ? {
              ...run,
              status: "completed" as SyncRunStatus,
              finishedAt,
              message: "Manual sync completed",
            }
          : run
      )

      setWarehouses(completedWarehouses)
      setSyncRuns(completedRuns)
      saveLocalWarehouses(user?.email, completedWarehouses)
      saveLocalSyncRuns(user?.email, completedRuns)
      setSyncingId(null)
    }, 900)
  }

  const copyToClipboard = async (value: string, id: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedId(id)
    window.setTimeout(() => setCopiedId(null), 1800)
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
                <BreadcrumbItem>Knowledge bases</BreadcrumbItem>
                <BreadcrumbSeparator>
                  <ChevronRight className="size-3.5" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbPage>Warehouse</BreadcrumbPage>
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
                    aria-label="Refresh warehouse"
                    disabled={refreshing}
                    onClick={refreshWarehouses}
                  >
                    <RefreshCw
                      className={refreshing ? "size-4 animate-spin" : "size-4"}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh warehouse</TooltipContent>
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
                      S3 and GCP ingestion
                    </Badge>
                    <Badge
                      className="w-fit rounded-sm font-mono"
                      variant="outline"
                    >
                      {COSAVU_ENDPOINTS.data.filesUpload}
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl font-semibold tracking-tight md:text-3xl">
                    Warehouse
                  </CardTitle>
                  <CardDescription className="max-w-2xl">
                    Connect external object stores, monitor sync health, and
                    index tenant-scoped warehouse files into Cosavu retrieval.
                  </CardDescription>
                </div>
                <CardAction className="col-span-full col-start-1 row-start-2 flex flex-wrap items-center gap-2 justify-self-start md:col-span-1 md:col-start-2 md:row-start-1 md:justify-self-end">
                  <Button
                    variant="outline"
                    className="rounded-sm"
                    onClick={refreshWarehouses}
                    disabled={refreshing}
                  >
                    <RefreshCw
                      className={refreshing ? "size-4 animate-spin" : "size-4"}
                    />
                    Sync state
                  </Button>
                  <Button className="rounded-sm" onClick={openSetupSheet}>
                    <Plus className="size-4" />
                    Connect warehouse
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Connections
                      </span>
                      <Unplug className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {warehouses.length}
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Active syncs
                      </span>
                      <RefreshCw className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {stats.activeSyncs}
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Objects scanned
                      </span>
                      <HardDrive className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {formatNumber(stats.objectsScanned)}
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Indexed chunks
                      </span>
                      <Database className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {formatNumber(stats.totalChunks)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {errorMessage && !setupSheetOpen && (
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
                    <CardTitle>Warehouse connections</CardTitle>
                    <CardDescription>
                      External stores that Cosavu can scan, parse, and index.
                    </CardDescription>
                  </div>
                  <CardAction className="col-span-full col-start-1 row-start-2 flex w-full flex-col gap-2 justify-self-stretch sm:flex-row lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:w-auto lg:justify-self-end">
                    <div className="relative w-full sm:w-72">
                      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-9 rounded-sm pl-9"
                        placeholder="Search warehouses..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                      />
                    </div>
                    <Tabs
                      value={providerFilter}
                      onValueChange={setProviderFilter}
                      className="w-full sm:w-auto"
                    >
                      <TabsList className="w-full rounded-sm sm:w-fit [&_[data-slot=tabs-trigger]]:rounded-sm">
                        <TabsTrigger className="rounded-sm" value="all">
                          All
                        </TabsTrigger>
                        <TabsTrigger className="rounded-sm" value="aws-s3">
                          S3
                        </TabsTrigger>
                        <TabsTrigger className="rounded-sm" value="gcp-storage">
                          GCP
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {filteredWarehouses.length > 0 ? (
                      filteredWarehouses.map((warehouse) => {
                        const isSelected =
                          selectedWarehouse?.id === warehouse.id
                        const ProviderIcon = getProviderIcon(warehouse.provider)
                        const scanPercent = Math.min(
                          100,
                          Math.round((warehouse.filesIndexed / 900) * 100)
                        )

                        return (
                          <button
                            key={warehouse.id}
                            type="button"
                            className={`w-full rounded-sm bg-muted/20 p-4 text-left transition-colors hover:bg-muted/35 ${
                              isSelected ? "ring-2 ring-primary/40" : ""
                            }`}
                            onClick={() => setSelectedWarehouseId(warehouse.id)}
                          >
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.75fr)] lg:items-center">
                              <div className="flex min-w-0 items-start gap-4">
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-background text-muted-foreground">
                                  <ProviderIcon className="size-5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate font-medium">
                                      {warehouse.name}
                                    </p>
                                    <Badge
                                      className="rounded-sm"
                                      variant={getStatusVariant(
                                        warehouse.status
                                      )}
                                    >
                                      {STATUS_LABELS[warehouse.status]}
                                    </Badge>
                                    <Badge
                                      className="rounded-sm"
                                      variant="outline"
                                    >
                                      {PROVIDER_LABELS[warehouse.provider]}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                    {warehouse.uri}
                                    {warehouse.prefix}
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    {formatBytes(warehouse.totalBytes)}
                                  </span>
                                  <span className="font-medium">
                                    {formatNumber(warehouse.filesIndexed)} files
                                  </span>
                                </div>
                                <Progress value={scanPercent} className="h-2" />
                              </div>
                            </div>
                          </button>
                        )
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center rounded-sm bg-muted/20 px-6 py-16 text-center">
                        <div className="mb-4 flex size-12 items-center justify-center rounded-sm bg-muted">
                          <Unplug className="size-5 text-muted-foreground" />
                        </div>
                        <p className="font-medium">No warehouse matches</p>
                        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                          Connect S3 or GCP Storage to start indexing external
                          files.
                        </p>
                        <Button
                          className="mt-5 rounded-sm"
                          onClick={openSetupSheet}
                        >
                          <Plus className="size-4" />
                          Connect warehouse
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle>Selected warehouse</CardTitle>
                  <CardDescription>
                    Source, credential, and indexing settings.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedWarehouse ? (
                    <>
                      <div className="rounded-sm bg-muted/30 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-lg font-semibold">
                              {selectedWarehouse.name}
                            </p>
                            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                              {selectedWarehouse.uri}
                              {selectedWarehouse.prefix}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-sm"
                            aria-label="Copy warehouse URI"
                            onClick={() =>
                              copyToClipboard(
                                `${selectedWarehouse.uri}${selectedWarehouse.prefix}`,
                                selectedWarehouse.id
                              )
                            }
                          >
                            {copiedId === selectedWarehouse.id ? (
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
                            Provider
                          </p>
                          <p className="mt-2 text-sm font-medium">
                            {PROVIDER_LABELS[selectedWarehouse.provider]}
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Region
                          </p>
                          <p className="mt-2 text-sm font-medium">
                            {selectedWarehouse.region}
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Last sync
                          </p>
                          <p className="mt-2 text-sm font-medium">
                            {formatDate(selectedWarehouse.lastSyncAt)}
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Next sync
                          </p>
                          <p className="mt-2 text-sm font-medium">
                            {formatDate(selectedWarehouse.nextSyncAt)}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-sm bg-muted/30 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <p className="font-medium">Credential reference</p>
                            <p className="truncate font-mono text-xs text-muted-foreground">
                              {selectedWarehouse.credentialLabel}
                            </p>
                          </div>
                          <KeyRound className="size-5 shrink-0 text-muted-foreground" />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-medium">Index system</p>
                            <p className="text-sm text-muted-foreground">
                              Files are parsed into tenant-scoped chunks.
                            </p>
                          </div>
                          <Badge className="rounded-sm" variant="secondary">
                            {selectedWarehouse.system.toUpperCase()}
                          </Badge>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-medium">Isolation</p>
                            <p className="text-sm text-muted-foreground">
                              Syncs write into private Cosavu collections.
                            </p>
                          </div>
                          <ShieldCheck className="size-5 shrink-0 text-muted-foreground" />
                        </div>
                      </div>

                      <Button
                        className="w-full rounded-sm"
                        disabled={Boolean(syncingId)}
                        onClick={() => syncWarehouse(selectedWarehouse.id)}
                      >
                        {syncingId === selectedWarehouse.id ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Play className="size-4" />
                        )}
                        Sync now
                      </Button>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <Card className="rounded-sm border-border/60 shadow-sm">
              <CardHeader className="gap-4 lg:grid-cols-[1fr_auto]">
                <div>
                  <CardTitle>Sync runs</CardTitle>
                  <CardDescription>
                    Recent warehouse scans for the selected source.
                  </CardDescription>
                </div>
                <CardAction className="justify-self-start lg:justify-self-end">
                  <Badge className="rounded-sm" variant="outline">
                    {selectedRuns.length} runs
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {selectedRuns.length > 0 ? (
                    selectedRuns.map((run, index) => (
                      <div key={run.id}>
                        {index > 0 && <Separator className="mb-3" />}
                        <div className="grid gap-4 rounded-sm bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-medium">
                                {formatDate(run.startedAt)}
                              </p>
                              <Badge
                                className="rounded-sm"
                                variant={getRunVariant(run.status)}
                              >
                                {RUN_STATUS_LABELS[run.status]}
                              </Badge>
                            </div>
                            <p className="mt-1 truncate text-sm text-muted-foreground">
                              {run.message}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <span className="text-muted-foreground">
                              {formatNumber(run.filesProcessed)} processed
                            </span>
                            <span className="text-muted-foreground">
                              {formatNumber(run.filesSkipped)} skipped
                            </span>
                            <span className="font-medium">
                              {formatNumber(run.chunksIndexed)} chunks
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-sm bg-muted/20 px-6 py-16 text-center">
                      <div className="mb-4 flex size-12 items-center justify-center rounded-sm bg-muted">
                        <RefreshCw className="size-5 text-muted-foreground" />
                      </div>
                      <p className="font-medium">No sync runs yet</p>
                      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                        Run a manual sync to create the first warehouse scan.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </main>

          <Sheet open={setupSheetOpen} onOpenChange={setSetupSheetOpen}>
            <SheetContent
              side="right"
              className="rounded-l-sm rounded-r-none sm:max-w-md"
            >
              <form className="flex h-full flex-col" onSubmit={createWarehouse}>
                <SheetHeader>
                  <SheetTitle>Connect warehouse</SheetTitle>
                  <SheetDescription>
                    Register an S3 or GCP Storage source for Cosavu to scan and
                    index through {COSAVU_ENDPOINTS.data.warehouseSync}.
                  </SheetDescription>
                </SheetHeader>

                <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6">
                  <div className="space-y-2">
                    <Label htmlFor="warehouse-name">Name</Label>
                    <Input
                      id="warehouse-name"
                      className="rounded-sm"
                      placeholder="Production docs lake"
                      value={warehouseName}
                      onChange={(event) => setWarehouseName(event.target.value)}
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="warehouse-provider">Provider</Label>
                      <Select
                        value={warehouseProvider}
                        onValueChange={(value) =>
                          setWarehouseProvider(value as WarehouseProvider)
                        }
                      >
                        <SelectTrigger
                          id="warehouse-provider"
                          className="w-full rounded-sm"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-sm">
                          <SelectItem className="rounded-sm" value="aws-s3">
                            AWS S3
                          </SelectItem>
                          <SelectItem
                            className="rounded-sm"
                            value="gcp-storage"
                          >
                            GCP Storage
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="warehouse-system">Index system</Label>
                      <Select
                        value={warehouseSystem}
                        onValueChange={(value) =>
                          setWarehouseSystem(value as RetrievalSystem)
                        }
                      >
                        <SelectTrigger
                          id="warehouse-system"
                          className="w-full rounded-sm"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-sm">
                          <SelectItem className="rounded-sm" value="car-0">
                            CAR-0
                          </SelectItem>
                          <SelectItem className="rounded-sm" value="car-1">
                            CAR-1
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="warehouse-uri">Bucket URI</Label>
                    <Input
                      id="warehouse-uri"
                      className="rounded-sm"
                      placeholder={
                        warehouseProvider === "aws-s3"
                          ? "s3://bucket-name/"
                          : "gs://bucket-name/"
                      }
                      value={warehouseUri}
                      onChange={(event) => setWarehouseUri(event.target.value)}
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="warehouse-prefix">Prefix</Label>
                      <Input
                        id="warehouse-prefix"
                        className="rounded-sm"
                        placeholder="raw/docs/"
                        value={warehousePrefix}
                        onChange={(event) =>
                          setWarehousePrefix(event.target.value)
                        }
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="warehouse-region">Region</Label>
                      <Select
                        value={warehouseRegion}
                        onValueChange={setWarehouseRegion}
                      >
                        <SelectTrigger
                          id="warehouse-region"
                          className="w-full rounded-sm"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-sm">
                          {REGION_OPTIONS.map((option) => (
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
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="warehouse-credential">
                      Credential reference
                    </Label>
                    <Input
                      id="warehouse-credential"
                      className="rounded-sm"
                      placeholder={
                        warehouseProvider === "aws-s3"
                          ? "arn:aws:iam::123:role/cosavu-reader"
                          : "service-account@project.iam.gserviceaccount.com"
                      }
                      value={credentialLabel}
                      onChange={(event) =>
                        setCredentialLabel(event.target.value)
                      }
                      required
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-sm bg-muted/30 p-4">
                    <div>
                      <p className="font-medium">Auto sync</p>
                      <p className="text-sm text-muted-foreground">
                        Queue recurring scans for changed warehouse objects.
                      </p>
                    </div>
                    <Switch
                      size="sm"
                      checked={autoSync}
                      onCheckedChange={setAutoSync}
                    />
                  </div>

                  {errorMessage && (
                    <div className="rounded-sm bg-destructive/10 p-3 text-sm text-destructive">
                      {errorMessage}
                    </div>
                  )}
                </div>

                <SheetFooter>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-sm"
                    onClick={() => setSetupSheetOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="rounded-sm"
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Connect
                  </Button>
                </SheetFooter>
              </form>
            </SheetContent>
          </Sheet>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
