"use client"

import { useEffect, useMemo, useState, type FormEvent } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Activity,
  Boxes,
  Building2,
  Check,
  ChevronRight,
  Cloud,
  Copy,
  KeyRound,
  Layers3,
  Loader2,
  Moon,
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
import {
  COSAVU_ENDPOINTS,
  createDataTenant,
  listDataTenants,
  saveLocalDataTenantKey,
} from "@/lib/cosavu-api"
import { watchConsoleAuth, type ConsoleUser } from "@/lib/console-auth"
import { isDemoStatsUser } from "@/lib/console-stats"

type TenantMode = "upload-api" | "warehouse" | "hybrid"
type TenantStatus = "active" | "syncing" | "attention"
type RetrievalSystem = "car-0" | "car-1"

type TenantRecord = {
  id: string
  name: string
  slug: string
  status: TenantStatus
  mode: TenantMode
  region: string
  ownerEmail: string
  createdAt: string
  apiKeys: number
  warehouses: number
  files: number
  chunks: number
  lastActivity: string
  defaultSystem: RetrievalSystem
  hardIsolation: boolean
}

const LOCAL_TENANTS_STORAGE_PREFIX = "cosavu:tenants"
const LOCAL_API_KEYS_STORAGE_PREFIX = "cosavu:api-keys"
const SEEDED_TENANT_IDS = new Set([
  "tenant-cosavu-main",
  "tenant-retrieval-sandbox",
  "tenant-enterprise-warehouse",
])

const MODE_LABELS: Record<TenantMode, string> = {
  "upload-api": "Upload API",
  warehouse: "Warehouse",
  hybrid: "Hybrid",
}

const STATUS_LABELS: Record<TenantStatus, string> = {
  active: "Active",
  syncing: "Syncing",
  attention: "Needs attention",
}

const REGION_OPTIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
]

function getTenantStorageKey(email?: string | null) {
  return `${LOCAL_TENANTS_STORAGE_PREFIX}:${email?.toLowerCase() || "unknown"}`
}

function getLocalApiKeysStorageKey(email?: string | null) {
  return `${LOCAL_API_KEYS_STORAGE_PREFIX}:${email?.toLowerCase() || "unknown"}`
}

function getLocalApiKeyCount(email?: string | null) {
  if (typeof window === "undefined") return 0

  try {
    const storedKeys = window.localStorage.getItem(
      getLocalApiKeysStorageKey(email)
    )
    if (!storedKeys) return 0

    const parsedKeys = JSON.parse(storedKeys)
    return Array.isArray(parsedKeys) ? parsedKeys.length : 0
  } catch {
    return 0
  }
}

function createDefaultTenants(email?: string | null, keyCount = 0) {
  if (!isDemoStatsUser(email)) {
    return [] satisfies TenantRecord[]
  }

  const ownerEmail = email || "workspace@cosavu.com"
  const now = new Date().toISOString()

  return [
    {
      id: "demo-tenant-enterprise-scale",
      name: "Enterprise Scale Workspace",
      slug: "enterprise-scale",
      status: "active",
      mode: "hybrid",
      region: "us-east-1",
      ownerEmail,
      createdAt: now,
      apiKeys: Math.max(keyCount, 1847),
      warehouses: 517,
      files: 64_820_453,
      chunks: 984_220_137,
      lastActivity: now,
      defaultSystem: "car-0",
      hardIsolation: true,
    },
    {
      id: "demo-tenant-dataman-production",
      name: "Dataman Production",
      slug: "dataman-production",
      status: "syncing",
      mode: "warehouse",
      region: "ap-south-1",
      ownerEmail,
      createdAt: now,
      apiKeys: 427,
      warehouses: 189,
      files: 18_730_219,
      chunks: 342_880_417,
      lastActivity: now,
      defaultSystem: "car-1",
      hardIsolation: true,
    },
  ] satisfies TenantRecord[]
}

function readLocalTenants(email?: string | null) {
  if (typeof window === "undefined") return []

  try {
    const storedTenants = window.localStorage.getItem(
      getTenantStorageKey(email)
    )
    if (!storedTenants) return []

    const parsedTenants = JSON.parse(storedTenants)
    if (!Array.isArray(parsedTenants)) return []

    return parsedTenants.filter((tenant): tenant is TenantRecord => {
      return Boolean(
        tenant?.id &&
        tenant?.name &&
        tenant?.slug &&
        !SEEDED_TENANT_IDS.has(tenant.id)
      )
    })
  } catch {
    return []
  }
}

function saveLocalTenants(
  email: string | null | undefined,
  tenants: TenantRecord[]
) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(
    getTenantStorageKey(email),
    JSON.stringify(tenants)
  )
}

function formatDate(value?: string | null) {
  if (!value) return "None"

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en").format(value)
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)

  return slug || "tenant"
}

function getRegionLabel(region: string) {
  return (
    REGION_OPTIONS.find((option) => option.value === region)?.label || region
  )
}

function getStatusVariant(status: TenantStatus) {
  if (status === "active") return "secondary"
  if (status === "syncing") return "outline"

  return "destructive"
}

export default function TenantsPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [user, setUser] = useState<ConsoleUser | null>(null)
  const [tenants, setTenants] = useState<TenantRecord[]>([])
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [modeFilter, setModeFilter] = useState("all")
  const [createSheetOpen, setCreateSheetOpen] = useState(false)
  const [tenantName, setTenantName] = useState("")
  const [tenantSlug, setTenantSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [tenantMode, setTenantMode] = useState<TenantMode>("hybrid")
  const [tenantRegion, setTenantRegion] = useState("us-east-1")
  const [defaultSystem, setDefaultSystem] = useState<RetrievalSystem>("car-0")
  const [hardIsolation, setHardIsolation] = useState(true)
  const [connectWarehouse, setConnectWarehouse] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

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

      setUser(currentUser)

      const keyCount = getLocalApiKeyCount(currentUser.email)
      const storedTenants = readLocalTenants(currentUser.email)
      const demoTenants = createDefaultTenants(currentUser.email, keyCount)
      const shouldMergeDemo = isDemoStatsUser(currentUser.email)
      const nextTenants = shouldMergeDemo
        ? [
            ...demoTenants,
            ...storedTenants.filter(
              (tenant) => !demoTenants.some((demo) => demo.id === tenant.id)
            ),
          ]
        : storedTenants.length > 0
          ? storedTenants
          : demoTenants

      if (shouldMergeDemo || storedTenants.length === 0) {
        saveLocalTenants(currentUser.email, nextTenants)
      }

      setTenants(nextTenants)
      setSelectedTenantId(nextTenants[0]?.id ?? null)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [router])

  const selectedTenant = useMemo(() => {
    return (
      tenants.find((tenant) => tenant.id === selectedTenantId) || tenants[0]
    )
  }, [selectedTenantId, tenants])

  const filteredTenants = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return tenants.filter((tenant) => {
      const matchesMode = modeFilter === "all" || tenant.mode === modeFilter
      const matchesQuery =
        !query ||
        tenant.name.toLowerCase().includes(query) ||
        tenant.slug.toLowerCase().includes(query) ||
        tenant.ownerEmail.toLowerCase().includes(query)

      return matchesMode && matchesQuery
    })
  }, [modeFilter, searchQuery, tenants])

  const stats = useMemo(() => {
    const activeTenants = tenants.filter(
      (tenant) => tenant.status === "active"
    ).length
    const warehouses = tenants.reduce(
      (sum, tenant) => sum + tenant.warehouses,
      0
    )
    const isolated = tenants.filter((tenant) => tenant.hardIsolation).length
    const isolation = tenants.length
      ? Math.round((isolated / tenants.length) * 100)
      : 0

    return { activeTenants, warehouses, isolation }
  }, [tenants])

  const refreshTenants = async () => {
    setRefreshing(true)

    if (isDemoStatsUser(user?.email)) {
      const keyCount = getLocalApiKeyCount(user?.email)
      const storedTenants = readLocalTenants(user?.email)
      const demoTenants = createDefaultTenants(user?.email, keyCount)
      const nextTenants = [
        ...demoTenants,
        ...storedTenants.filter(
          (tenant) => !demoTenants.some((demo) => demo.id === tenant.id)
        ),
      ]

      saveLocalTenants(user?.email, nextTenants)
      setTenants(nextTenants)
      setSelectedTenantId((currentId) => currentId || nextTenants[0]?.id)
      window.setTimeout(() => setRefreshing(false), 650)
      return
    }

    try {
      const realTenants = await listDataTenants(user?.email)
      if (realTenants.length > 0) {
        const now = new Date().toISOString()
        const nextTenants: TenantRecord[] = realTenants.map((tenant) => ({
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: "active",
          mode: "hybrid",
          region: tenantRegion,
          ownerEmail:
            (tenant as any).owner_email ||
            user?.email ||
            "workspace@cosavu.com",
          createdAt: tenant.created_at,
          apiKeys: 1,
          warehouses: 0,
          files: 0,
          chunks: 0,
          lastActivity: now,
          defaultSystem: "car-0",
          hardIsolation: true,
        }))

        saveLocalTenants(user?.email, nextTenants)
        setTenants(nextTenants)
        setSelectedTenantId(
          (currentId) => currentId || nextTenants[0]?.id || null
        )
        return
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to sync DataAPI tenants"

      if (!/not found/i.test(message)) {
        setErrorMessage(
          `Could not sync real DataAPI tenants: ${message}. Showing the last local snapshot.`
        )
      }
    } finally {
      setRefreshing(false)
    }

    const keyCount = getLocalApiKeyCount(user?.email)
    const storedTenants = readLocalTenants(user?.email)
    const nextTenants =
      storedTenants.length > 0
        ? storedTenants
        : createDefaultTenants(user?.email, keyCount)

    setTenants(nextTenants)
    setSelectedTenantId((currentId) => currentId || nextTenants[0]?.id || null)
  }

  const openCreateSheet = () => {
    setErrorMessage(null)
    setTenantName("")
    setTenantSlug("")
    setSlugTouched(false)
    setTenantMode("hybrid")
    setTenantRegion("us-east-1")
    setDefaultSystem("car-0")
    setHardIsolation(true)
    setConnectWarehouse(false)
    setCreateSheetOpen(true)
  }

  const handleTenantNameChange = (value: string) => {
    setErrorMessage(null)
    setTenantName(value)

    if (!slugTouched) {
      setTenantSlug(slugify(value))
    }
  }

  const handleTenantSlugChange = (value: string) => {
    setErrorMessage(null)
    setSlugTouched(true)
    setTenantSlug(slugify(value))
  }

  const createTenant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = tenantName.trim()
    const slug = slugify(tenantSlug || tenantName)

    if (!name) {
      setErrorMessage("Enter a tenant name.")
      return
    }

    const existingLocalTenant = tenants.find((tenant) => tenant.slug === slug)

    setSaving(true)
    setErrorMessage(null)

    try {
      const result = await createDataTenant({
        name,
        slug,
        keyName: `${name} console key`,
        ownerEmail: user?.email,
      })

      const now = new Date().toISOString()
      const createdAt =
        result.tenant.created_at || existingLocalTenant?.createdAt || now
      const nextTenant: TenantRecord = {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
        status: connectWarehouse ? "syncing" : "active",
        mode: existingLocalTenant?.mode || tenantMode,
        region: existingLocalTenant?.region || tenantRegion,
        ownerEmail:
          result.tenant.owner_email ||
          existingLocalTenant?.ownerEmail ||
          user?.email ||
          "workspace@cosavu.com",
        createdAt,
        apiKeys: Math.max(existingLocalTenant?.apiKeys || 0, 1),
        warehouses:
          existingLocalTenant?.warehouses ||
          (connectWarehouse || tenantMode !== "upload-api" ? 1 : 0),
        files: existingLocalTenant?.files || 0,
        chunks: existingLocalTenant?.chunks || 0,
        lastActivity: now,
        defaultSystem: existingLocalTenant?.defaultSystem || defaultSystem,
        hardIsolation: existingLocalTenant?.hardIsolation ?? hardIsolation,
      }

      saveLocalDataTenantKey(user?.email, {
        tenantId: result.tenant.id,
        tenantName: result.tenant.name,
        tenantSlug: result.tenant.slug,
        keyId: result.api_key_id,
        apiKey: result.api_key,
        createdAt: now,
      })

      const nextTenants = existingLocalTenant
        ? tenants.map((tenant) =>
            tenant.slug === result.tenant.slug ? nextTenant : tenant
          )
        : [nextTenant, ...tenants]
      saveLocalTenants(user?.email, nextTenants)
      setTenants(nextTenants)
      setSelectedTenantId(nextTenant.id)
      setCreateSheetOpen(false)
    } catch (error: any) {
      let message = "Could not create DataAPI tenant."

      if (error instanceof Error) {
        message = error.message
      }

      if (message.includes("401") || message.includes("403")) {
        message =
          "Authentication failed. Please check your admin token configuration."
      }

      setErrorMessage(message)
    } finally {
      setSaving(false)
    }
  }

  const copyToClipboard = async (value: string, field: string) => {
    await navigator.clipboard.writeText(value)
    setCopiedField(field)
    window.setTimeout(() => setCopiedField(null), 1800)
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
              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <Skeleton className="h-96 w-full" />
                <Skeleton className="h-96 w-full" />
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
                <BreadcrumbItem>System administration</BreadcrumbItem>
                <BreadcrumbSeparator>
                  <ChevronRight className="size-3.5" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbPage>Tenants</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
            <div className="ml-auto flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Refresh tenants"
                    disabled={refreshing}
                    onClick={refreshTenants}
                  >
                    <RefreshCw
                      className={refreshing ? "size-4 animate-spin" : "size-4"}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh tenants</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
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
                  <div className="flex flex-wrap gap-2">
                    <Badge className="w-fit rounded-sm" variant="secondary">
                      Multi-tenant control plane
                    </Badge>
                    <Badge
                      className="w-fit rounded-sm font-mono"
                      variant="outline"
                    >
                      {COSAVU_ENDPOINTS.stan.apiKeys}
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl font-semibold tracking-tight md:text-3xl">
                    Tenants
                  </CardTitle>
                  <CardDescription className="max-w-2xl">
                    Create and govern the enterprise boundaries that own API
                    keys, isolated buckets, warehouse syncs, and Cosavu
                    retrieval settings.
                  </CardDescription>
                </div>
                <CardAction className="col-span-full col-start-1 row-start-2 flex flex-wrap items-center gap-2 justify-self-start md:col-span-1 md:col-start-2 md:row-start-1 md:justify-self-end">
                  <Button
                    variant="outline"
                    onClick={refreshTenants}
                    disabled={refreshing}
                  >
                    <RefreshCw
                      className={refreshing ? "size-4 animate-spin" : "size-4"}
                    />
                    Sync
                  </Button>
                  <Button onClick={openCreateSheet}>
                    <Plus className="size-4" />
                    Create tenant
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Total tenants
                      </span>
                      <Building2 className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">{tenants.length}</p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Active
                      </span>
                      <ShieldCheck className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {stats.activeTenants}
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Warehouses
                      </span>
                      <Cloud className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">{stats.warehouses}</p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Isolation
                      </span>
                      <Layers3 className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">{stats.isolation}%</p>
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
                    <CardTitle>Tenant registry</CardTitle>
                    <CardDescription>
                      Admin-visible tenants from the same model used by the
                      DataAPI v2 auth layer.
                    </CardDescription>
                  </div>
                  <CardAction className="col-span-full col-start-1 row-start-2 flex w-full flex-col gap-2 justify-self-stretch sm:flex-row lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:w-auto lg:justify-self-end">
                    <div className="relative w-full sm:w-72">
                      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-9 pl-9"
                        placeholder="Search tenants..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                      />
                    </div>
                    <Tabs
                      value={modeFilter}
                      onValueChange={setModeFilter}
                      className="w-full sm:w-auto"
                    >
                      <TabsList className="w-full sm:w-fit">
                        <TabsTrigger value="all">All</TabsTrigger>
                        <TabsTrigger value="hybrid">Hybrid</TabsTrigger>
                        <TabsTrigger value="warehouse">Warehouse</TabsTrigger>
                        <TabsTrigger value="upload-api">Upload</TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {filteredTenants.length > 0 ? (
                      filteredTenants.map((tenant) => {
                        const isSelected = selectedTenant?.id === tenant.id

                        return (
                          <button
                            key={tenant.id}
                            type="button"
                            className={`w-full rounded-sm bg-muted/20 p-4 text-left transition-colors hover:bg-muted/35 ${
                              isSelected ? "ring-2 ring-primary/40" : ""
                            }`}
                            onClick={() => setSelectedTenantId(tenant.id)}
                          >
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                              <div className="flex min-w-0 items-start gap-4">
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-background text-muted-foreground">
                                  <Building2 className="size-5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate font-medium">
                                      {tenant.name}
                                    </p>
                                    <Badge
                                      className="rounded-sm"
                                      variant={getStatusVariant(tenant.status)}
                                    >
                                      {STATUS_LABELS[tenant.status]}
                                    </Badge>
                                    <Badge
                                      className="rounded-sm"
                                      variant="outline"
                                    >
                                      {MODE_LABELS[tenant.mode]}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                    tenant_slug={tenant.slug}
                                  </p>
                                </div>
                              </div>

                              <div className="grid grid-cols-3 gap-3 text-sm sm:min-w-72">
                                <div className="rounded-sm bg-background/70 p-3">
                                  <p className="text-xs text-muted-foreground">
                                    Keys
                                  </p>
                                  <p className="mt-1 font-semibold">
                                    {tenant.apiKeys}
                                  </p>
                                </div>
                                <div className="rounded-sm bg-background/70 p-3">
                                  <p className="text-xs text-muted-foreground">
                                    Files
                                  </p>
                                  <p className="mt-1 font-semibold">
                                    {tenant.files}
                                  </p>
                                </div>
                                <div className="rounded-sm bg-background/70 p-3">
                                  <p className="text-xs text-muted-foreground">
                                    Chunks
                                  </p>
                                  <p className="mt-1 font-semibold">
                                    {formatNumber(tenant.chunks)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          </button>
                        )
                      })
                    ) : (
                      <div className="flex flex-col items-center justify-center rounded-sm bg-muted/20 px-6 py-16 text-center">
                        <div className="mb-4 flex size-12 items-center justify-center rounded-sm bg-muted">
                          <Building2 className="size-5 text-muted-foreground" />
                        </div>
                        <p className="font-medium">No tenants match filters</p>
                        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                          Try a different search term or switch the tenant mode.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle>Selected tenant</CardTitle>
                  <CardDescription>
                    Tenant identity and isolation controls for authenticated
                    DataAPI calls.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedTenant ? (
                    <>
                      <div className="rounded-sm bg-muted/30 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-lg font-semibold">
                              {selectedTenant.name}
                            </p>
                            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                              {selectedTenant.id}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Copy tenant ID"
                            onClick={() =>
                              copyToClipboard(selectedTenant.id, "tenant-id")
                            }
                          >
                            {copiedField === "tenant-id" ? (
                              <Check className="size-4 text-emerald-600" />
                            ) : (
                              <Copy className="size-4" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">Slug</p>
                          <p className="mt-2 truncate font-mono text-sm font-medium">
                            {selectedTenant.slug}
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Created
                          </p>
                          <p className="mt-2 text-sm font-medium">
                            {formatDate(selectedTenant.createdAt)}
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">Owner</p>
                          <p className="mt-2 truncate text-sm font-medium">
                            {selectedTenant.ownerEmail}
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Region
                          </p>
                          <p className="mt-2 text-sm font-medium">
                            {getRegionLabel(selectedTenant.region)}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-sm bg-muted/30 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-medium">Hard isolation</p>
                            <p className="text-sm text-muted-foreground">
                              API keys, files, warehouses, and collections stay
                              tenant-scoped.
                            </p>
                          </div>
                          <Switch
                            checked={selectedTenant.hardIsolation}
                            disabled
                          />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-medium">Default system</p>
                            <p className="text-sm text-muted-foreground">
                              Retrieval layer used for new indexed content.
                            </p>
                          </div>
                          <Badge className="rounded-sm" variant="secondary">
                            {selectedTenant.defaultSystem.toUpperCase()}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-2 rounded-sm bg-muted/30 p-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">
                            Tenant data indexed
                          </span>
                          <span className="font-medium">
                            {formatNumber(selectedTenant.chunks)} chunks
                          </span>
                        </div>
                        <Progress
                          value={Math.min(
                            100,
                            Math.round(selectedTenant.chunks / 160)
                          )}
                          className="h-2"
                        />
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <Button asChild variant="outline">
                          <Link href="/api">
                            <KeyRound className="size-4" />
                            Open API keys
                          </Link>
                        </Button>
                        <Button asChild variant="outline">
                          <Link href="/billing">
                            <Activity className="size-4" />
                            View usage
                          </Link>
                        </Button>
                      </div>
                    </>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle>Data plane</CardTitle>
                  <CardDescription>
                    The tenant boundary maps directly to the backend ingestion
                    and retrieval paths.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-4 flex size-10 items-center justify-center rounded-sm bg-background text-muted-foreground">
                      <Boxes className="size-5" />
                    </div>
                    <p className="font-medium">Upload API</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Tenant-scoped uploads land in isolated Cosavu buckets and
                      file records.
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-4 flex size-10 items-center justify-center rounded-sm bg-background text-muted-foreground">
                      <Cloud className="size-5" />
                    </div>
                    <p className="font-medium">Warehouse</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      S3, GCP, or Azure buckets can sync into the tenant vector
                      namespace.
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-4 flex size-10 items-center justify-center rounded-sm bg-background text-muted-foreground">
                      <Zap className="size-5" />
                    </div>
                    <p className="font-medium">Engram filter</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      CAR-1 prunes broad retrieval candidates before context is
                      returned.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle>Tenant API contract</CardTitle>
                  <CardDescription>
                    Admin routes create the boundary; authenticated routes read
                    the tenant from the X-API-Key header.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {[
                    ["Generate key", `POST ${COSAVU_ENDPOINTS.stan.apiKeys}`],
                    ["List buckets", `GET ${COSAVU_ENDPOINTS.data.buckets}`],
                    [
                      "Upload file",
                      `POST ${COSAVU_ENDPOINTS.data.filesUpload}`,
                    ],
                    ["Query tenant", `POST ${COSAVU_ENDPOINTS.data.query}`],
                  ].map(([label, route]) => (
                    <div
                      key={route}
                      className="flex flex-col gap-2 rounded-sm bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="font-medium">{label}</p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {route}
                        </p>
                      </div>
                      <Badge className="w-fit rounded-sm" variant="outline">
                        v2
                      </Badge>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </main>

          <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
            <SheetContent
              side="right"
              className="rounded-l-sm rounded-r-none sm:max-w-md"
            >
              <form className="flex h-full flex-col" onSubmit={createTenant}>
                <SheetHeader>
                  <SheetTitle>Create new tenant</SheetTitle>
                  <SheetDescription>
                    Create a new enterprise boundary for buckets, files,
                    warehouse syncs, and retrieval settings.
                  </SheetDescription>
                </SheetHeader>

                <div className="flex flex-1 flex-col gap-5 px-6">
                  <div className="space-y-2">
                    <Label htmlFor="tenant-name">Tenant name</Label>
                    <Input
                      id="tenant-name"
                      placeholder="Acme Production"
                      value={tenantName}
                      onChange={(event) =>
                        handleTenantNameChange(event.target.value)
                      }
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tenant-slug">Tenant slug</Label>
                    <Input
                      id="tenant-slug"
                      className="font-mono"
                      placeholder="acme-production"
                      value={tenantSlug}
                      onChange={(event) =>
                        handleTenantSlugChange(event.target.value)
                      }
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="tenant-mode">Mode</Label>
                      <Select
                        value={tenantMode}
                        onValueChange={(value) =>
                          setTenantMode(value as TenantMode)
                        }
                      >
                        <SelectTrigger
                          id="tenant-mode"
                          className="w-full rounded-sm"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-sm">
                          <SelectItem className="rounded-sm" value="hybrid">
                            Hybrid
                          </SelectItem>
                          <SelectItem className="rounded-sm" value="upload-api">
                            Upload API
                          </SelectItem>
                          <SelectItem className="rounded-sm" value="warehouse">
                            Warehouse
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="tenant-system">Default system</Label>
                      <Select
                        value={defaultSystem}
                        onValueChange={(value) =>
                          setDefaultSystem(value as RetrievalSystem)
                        }
                      >
                        <SelectTrigger
                          id="tenant-system"
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
                    <Label htmlFor="tenant-region">Region</Label>
                    <Select
                      value={tenantRegion}
                      onValueChange={setTenantRegion}
                    >
                      <SelectTrigger
                        id="tenant-region"
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

                  <div className="flex items-center justify-between gap-4 rounded-sm bg-muted/30 p-3">
                    <div className="space-y-1">
                      <Label htmlFor="hard-isolation">Hard isolation</Label>
                      <p className="text-xs text-muted-foreground">
                        Tenant-scoped keys, files, warehouses, and collections.
                      </p>
                    </div>
                    <Switch
                      id="hard-isolation"
                      checked={hardIsolation}
                      onCheckedChange={setHardIsolation}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 rounded-sm bg-muted/30 p-3">
                    <div className="space-y-1">
                      <Label htmlFor="connect-warehouse">
                        Start warehouse connection
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Put the tenant into syncing state after creation.
                      </p>
                    </div>
                    <Switch
                      id="connect-warehouse"
                      checked={connectWarehouse}
                      onCheckedChange={setConnectWarehouse}
                    />
                  </div>
                </div>

                <SheetFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setCreateSheetOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      saving || !tenantName.trim() || !tenantSlug.trim()
                    }
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    Create tenant
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
