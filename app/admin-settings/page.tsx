"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Check,
  ChevronRight,
  Cloud,
  Copy,
  Database,
  KeyRound,
  Loader2,
  LockKeyhole,
  Moon,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Sun,
  TerminalSquare,
  Webhook,
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
  COSAVU_DATA_API_BASE_URL,
  COSAVU_STAN_API_BASE_URL,
} from "@/lib/cosavu-api"
import { watchConsoleAuth, type ConsoleUser } from "@/lib/console-auth"

type AdminSettings = {
  workspaceName: string
  workspaceSlug: string
  ownerEmail: string
  supportEmail: string
  region: string
  timezone: string
  defaultSystem: "car-0" | "car-1"
  defaultPermissions: "read" | "read,write"
  keyRotationDays: string
  requireTenantHeader: boolean
  hardIsolation: boolean
  allowBrowserKeys: boolean
  auditRetentionDays: string
  warehouseMode: boolean
  uploadApiMode: boolean
  allowAws: boolean
  allowGcp: boolean
  allowAzure: boolean
  redactCredentials: boolean
  maxCandidates: string
  maxTopK: string
  car1Threshold: string
  webhookUrl: string
  usageAlerts: boolean
  billingAlerts: boolean
  syncAlerts: boolean
}

const LOCAL_ADMIN_SETTINGS_STORAGE_PREFIX = "cosavu:admin-settings"

const REGION_OPTIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
]

const TIMEZONE_OPTIONS = [
  { value: "Asia/Calcutta", label: "Asia/Calcutta" },
  { value: "UTC", label: "UTC" },
  { value: "America/New_York", label: "America/New_York" },
  { value: "Europe/London", label: "Europe/London" },
]

function getSettingsStorageKey(email?: string | null) {
  return `${LOCAL_ADMIN_SETTINGS_STORAGE_PREFIX}:${email?.toLowerCase() || "unknown"}`
}

function getDefaultSettings(email?: string | null): AdminSettings {
  return {
    workspaceName: "Cosavu Team Workspace",
    workspaceSlug: "cosavu",
    ownerEmail: email || "workspace@cosavu.com",
    supportEmail: email || "support@cosavu.com",
    region: "us-east-1",
    timezone: "Asia/Calcutta",
    defaultSystem: "car-0",
    defaultPermissions: "read,write",
    keyRotationDays: "30",
    requireTenantHeader: true,
    hardIsolation: true,
    allowBrowserKeys: false,
    auditRetentionDays: "90",
    warehouseMode: true,
    uploadApiMode: true,
    allowAws: true,
    allowGcp: true,
    allowAzure: false,
    redactCredentials: true,
    maxCandidates: "20",
    maxTopK: "5",
    car1Threshold: "0.50",
    webhookUrl: "",
    usageAlerts: true,
    billingAlerts: true,
    syncAlerts: true,
  }
}

function readLocalSettings(email?: string | null) {
  if (typeof window === "undefined") return null

  try {
    const storedSettings = window.localStorage.getItem(
      getSettingsStorageKey(email)
    )
    if (!storedSettings) return null

    return JSON.parse(storedSettings) as AdminSettings
  } catch {
    return null
  }
}

function saveLocalSettings(
  email: string | null | undefined,
  settings: AdminSettings
) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(
    getSettingsStorageKey(email),
    JSON.stringify(settings)
  )
}

function formatDate(value?: string | null) {
  if (!value) return "Not saved yet"

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value))
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)

  return slug || "workspace"
}

export default function AdminSettingsPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [copied, setCopied] = useState(false)
  const [user, setUser] = useState<ConsoleUser | null>(null)
  const [activeTab, setActiveTab] = useState("workspace")
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  const [settings, setSettings] = useState<AdminSettings>(() =>
    getDefaultSettings()
  )

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

      const storedSettings = readLocalSettings(currentUser.email)
      const nextSettings =
        storedSettings || getDefaultSettings(currentUser.email)

      if (!storedSettings) {
        saveLocalSettings(currentUser.email, nextSettings)
      }

      setUser(currentUser)
      setSettings(nextSettings)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [router])

  const securityScore = useMemo(() => {
    const checks = [
      settings.requireTenantHeader,
      settings.hardIsolation,
      !settings.allowBrowserKeys,
      settings.redactCredentials,
      Number(settings.keyRotationDays) <= 30,
    ]

    return Math.round(
      (checks.filter(Boolean).length / Math.max(checks.length, 1)) * 100
    )
  }, [settings])

  const enabledProviders = useMemo(() => {
    return [
      settings.allowAws ? "AWS" : null,
      settings.allowGcp ? "GCP" : null,
      settings.allowAzure ? "Azure" : null,
    ].filter(Boolean)
  }, [settings])

  const updateSettings = (updates: Partial<AdminSettings>) => {
    setSettings((currentSettings) => ({ ...currentSettings, ...updates }))
  }

  const refreshSettings = () => {
    setRefreshing(true)

    const storedSettings = readLocalSettings(user?.email)
    setSettings(storedSettings || getDefaultSettings(user?.email))
    window.setTimeout(() => setRefreshing(false), 700)
  }

  const saveSettings = () => {
    setSaving(true)
    const savedAt = new Date().toISOString()

    saveLocalSettings(user?.email, settings)
    window.setTimeout(() => {
      setLastSavedAt(savedAt)
      setSaving(false)
    }, 600)
  }

  const resetSettings = () => {
    const nextSettings = getDefaultSettings(user?.email)

    setSettings(nextSettings)
    saveLocalSettings(user?.email, nextSettings)
    setLastSavedAt(new Date().toISOString())
  }

  const copyWorkspaceSlug = async () => {
    await navigator.clipboard.writeText(settings.workspaceSlug)
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
              <Skeleton className="h-4 w-60" />
              <Skeleton className="ml-auto size-8 rounded-full" />
            </header>
            <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 p-4 lg:p-6">
              <Skeleton className="h-40 w-full" />
              <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
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
                  <BreadcrumbPage>Admin settings</BreadcrumbPage>
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
                    aria-label="Refresh settings"
                    disabled={refreshing}
                    onClick={refreshSettings}
                  >
                    <RefreshCw
                      className={refreshing ? "size-4 animate-spin" : "size-4"}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh settings</TooltipContent>
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
                      Workspace policy
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
                    Admin settings
                  </CardTitle>
                  <CardDescription className="max-w-2xl">
                    Configure the control-plane defaults that govern Cosavu
                    tenants, API credentials, warehouse ingestion, and retrieval
                    policy.
                  </CardDescription>
                </div>
                <CardAction className="col-span-full col-start-1 row-start-2 flex flex-wrap items-center gap-2 justify-self-start md:col-span-1 md:col-start-2 md:row-start-1 md:justify-self-end">
                  <Button
                    variant="outline"
                    className="rounded-sm"
                    onClick={resetSettings}
                  >
                    <RotateCcw className="size-4" />
                    Reset
                  </Button>
                  <Button
                    className="rounded-sm"
                    onClick={saveSettings}
                    disabled={saving}
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Save changes
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Workspace
                      </span>
                      <Settings className="size-4 text-muted-foreground" />
                    </div>
                    <p className="truncate text-2xl font-semibold">
                      {settings.workspaceSlug}
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Providers
                      </span>
                      <Cloud className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {enabledProviders.length}
                    </p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Last saved
                      </span>
                      <Check className="size-4 text-muted-foreground" />
                    </div>
                    <p className="truncate text-sm font-semibold">
                      {formatDate(lastSavedAt)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full rounded-sm sm:w-fit [&_[data-slot=tabs-trigger]]:rounded-sm [&_[data-slot=tabs-trigger][data-active]]:rounded-sm">
                <TabsTrigger
                  className="rounded-sm data-active:rounded-sm"
                  value="workspace"
                >
                  Workspace
                </TabsTrigger>
                <TabsTrigger
                  className="rounded-sm data-active:rounded-sm"
                  value="security"
                >
                  Security
                </TabsTrigger>
                <TabsTrigger
                  className="rounded-sm data-active:rounded-sm"
                  value="data"
                >
                  Data plane
                </TabsTrigger>
                <TabsTrigger
                  className="rounded-sm data-active:rounded-sm"
                  value="alerts"
                >
                  Alerts
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {activeTab === "workspace" && (
              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle>Workspace profile</CardTitle>
                  <CardDescription>
                    Naming, owner routing, and environment defaults for the
                    console workspace.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="workspace-name">Workspace name</Label>
                      <Input
                        id="workspace-name"
                        value={settings.workspaceName}
                        onChange={(event) =>
                          updateSettings({
                            workspaceName: event.target.value,
                            workspaceSlug: slugify(event.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="workspace-slug">Workspace slug</Label>
                      <div className="flex gap-2">
                        <Input
                          id="workspace-slug"
                          className="font-mono"
                          value={settings.workspaceSlug}
                          onChange={(event) =>
                            updateSettings({
                              workspaceSlug: slugify(event.target.value),
                            })
                          }
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="rounded-sm"
                          aria-label="Copy workspace slug"
                          onClick={copyWorkspaceSlug}
                        >
                          {copied ? (
                            <Check className="size-4 text-emerald-600" />
                          ) : (
                            <Copy className="size-4" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="owner-email">Owner email</Label>
                      <Input
                        id="owner-email"
                        type="email"
                        value={settings.ownerEmail}
                        onChange={(event) =>
                          updateSettings({ ownerEmail: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="support-email">Support email</Label>
                      <Input
                        id="support-email"
                        type="email"
                        value={settings.supportEmail}
                        onChange={(event) =>
                          updateSettings({ supportEmail: event.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="workspace-region">Default region</Label>
                      <Select
                        value={settings.region}
                        onValueChange={(value) =>
                          updateSettings({ region: value })
                        }
                      >
                        <SelectTrigger
                          id="workspace-region"
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
                    <div className="space-y-2">
                      <Label htmlFor="workspace-timezone">Timezone</Label>
                      <Select
                        value={settings.timezone}
                        onValueChange={(value) =>
                          updateSettings({ timezone: value })
                        }
                      >
                        <SelectTrigger
                          id="workspace-timezone"
                          className="w-full rounded-sm"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-sm">
                          {TIMEZONE_OPTIONS.map((option) => (
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
                </CardContent>
              </Card>
            )}

            {activeTab === "security" && (
              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle>Security posture</CardTitle>
                  <CardDescription>
                    Guardrails for tenant resolution and credential handling.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2 rounded-sm bg-muted/30 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Policy coverage
                      </span>
                      <span className="font-medium">{securityScore}%</span>
                    </div>
                    <Progress value={securityScore} className="h-2" />
                  </div>

                  <div className="space-y-3 rounded-sm bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">Require tenant context</p>
                        <p className="text-sm text-muted-foreground">
                          Resolve requests through the X-API-Key tenant guard.
                        </p>
                      </div>
                      <Switch
                        checked={settings.requireTenantHeader}
                        onCheckedChange={(checked) =>
                          updateSettings({ requireTenantHeader: checked })
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">Hard isolation</p>
                        <p className="text-sm text-muted-foreground">
                          Keep buckets, warehouses, files, and keys scoped.
                        </p>
                      </div>
                      <Switch
                        checked={settings.hardIsolation}
                        onCheckedChange={(checked) =>
                          updateSettings({ hardIsolation: checked })
                        }
                      />
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">Browser key exposure</p>
                        <p className="text-sm text-muted-foreground">
                          Permit API credentials in public client code.
                        </p>
                      </div>
                      <Switch
                        checked={settings.allowBrowserKeys}
                        onCheckedChange={(checked) =>
                          updateSettings({ allowBrowserKeys: checked })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="key-rotation">Key rotation days</Label>
                      <Input
                        id="key-rotation"
                        inputMode="numeric"
                        value={settings.keyRotationDays}
                        onChange={(event) =>
                          updateSettings({
                            keyRotationDays: event.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="default-permissions">
                        Default permissions
                      </Label>
                      <Select
                        value={settings.defaultPermissions}
                        onValueChange={(value) =>
                          updateSettings({
                            defaultPermissions:
                              value as AdminSettings["defaultPermissions"],
                          })
                        }
                      >
                        <SelectTrigger
                          id="default-permissions"
                          className="w-full rounded-sm"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="rounded-sm">
                          <SelectItem className="rounded-sm" value="read">
                            Read only
                          </SelectItem>
                          <SelectItem className="rounded-sm" value="read,write">
                            Read and write
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === "data" && (
              <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                <Card className="rounded-sm border-border/60 shadow-sm">
                  <CardHeader>
                    <CardTitle>Data plane defaults</CardTitle>
                    <CardDescription>
                      Configure ingestion modes, provider access, and credential
                      handling for new tenants.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex items-center justify-between gap-4 rounded-sm bg-muted/30 p-4">
                        <div>
                          <p className="font-medium">Upload API</p>
                          <p className="text-sm text-muted-foreground">
                            Allow isolated Cosavu buckets.
                          </p>
                        </div>
                        <Switch
                          checked={settings.uploadApiMode}
                          onCheckedChange={(checked) =>
                            updateSettings({ uploadApiMode: checked })
                          }
                        />
                      </div>
                      <div className="flex items-center justify-between gap-4 rounded-sm bg-muted/30 p-4">
                        <div>
                          <p className="font-medium">Warehouse</p>
                          <p className="text-sm text-muted-foreground">
                            Allow external cloud buckets.
                          </p>
                        </div>
                        <Switch
                          checked={settings.warehouseMode}
                          onCheckedChange={(checked) =>
                            updateSettings({ warehouseMode: checked })
                          }
                        />
                      </div>
                    </div>

                    <div className="space-y-3 rounded-sm bg-muted/30 p-4">
                      <div className="flex items-center justify-between">
                        <p className="font-medium">Allowed providers</p>
                        <Badge className="rounded-sm" variant="secondary">
                          {enabledProviders.length} active
                        </Badge>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        <Button
                          type="button"
                          variant={settings.allowAws ? "default" : "outline"}
                          className="rounded-sm"
                          onClick={() =>
                            updateSettings({ allowAws: !settings.allowAws })
                          }
                        >
                          <Cloud className="size-4" />
                          AWS
                        </Button>
                        <Button
                          type="button"
                          variant={settings.allowGcp ? "default" : "outline"}
                          className="rounded-sm"
                          onClick={() =>
                            updateSettings({ allowGcp: !settings.allowGcp })
                          }
                        >
                          <Database className="size-4" />
                          GCP
                        </Button>
                        <Button
                          type="button"
                          variant={settings.allowAzure ? "default" : "outline"}
                          className="rounded-sm"
                          onClick={() =>
                            updateSettings({ allowAzure: !settings.allowAzure })
                          }
                        >
                          <Zap className="size-4" />
                          Azure
                        </Button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 rounded-sm bg-muted/30 p-4">
                      <div>
                        <p className="font-medium">Redact credentials</p>
                        <p className="text-sm text-muted-foreground">
                          Hide provider secrets after warehouse registration.
                        </p>
                      </div>
                      <Switch
                        checked={settings.redactCredentials}
                        onCheckedChange={(checked) =>
                          updateSettings({ redactCredentials: checked })
                        }
                      />
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-sm border-border/60 shadow-sm">
                  <CardHeader>
                    <CardTitle>Retrieval limits</CardTitle>
                    <CardDescription>
                      Defaults for CAR-0 semantic retrieval and CAR-1 Engram
                      pruning.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-5">
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor="max-candidates">CAR candidates</Label>
                        <Input
                          id="max-candidates"
                          inputMode="numeric"
                          value={settings.maxCandidates}
                          onChange={(event) =>
                            updateSettings({
                              maxCandidates: event.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="max-top-k">Top K</Label>
                        <Input
                          id="max-top-k"
                          inputMode="numeric"
                          value={settings.maxTopK}
                          onChange={(event) =>
                            updateSettings({ maxTopK: event.target.value })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="car1-threshold">Engram threshold</Label>
                        <Input
                          id="car1-threshold"
                          inputMode="decimal"
                          value={settings.car1Threshold}
                          onChange={(event) =>
                            updateSettings({
                              car1Threshold: event.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="default-system">Default system</Label>
                        <Select
                          value={settings.defaultSystem}
                          onValueChange={(value) =>
                            updateSettings({
                              defaultSystem:
                                value as AdminSettings["defaultSystem"],
                            })
                          }
                        >
                          <SelectTrigger
                            id="default-system"
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
                      <div className="space-y-2">
                        <Label htmlFor="audit-retention">Audit retention</Label>
                        <Input
                          id="audit-retention"
                          inputMode="numeric"
                          value={settings.auditRetentionDays}
                          onChange={(event) =>
                            updateSettings({
                              auditRetentionDays: event.target.value,
                            })
                          }
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="rounded-sm bg-muted/30 p-4">
                        <TerminalSquare className="mb-3 size-5 text-muted-foreground" />
                        <p className="font-medium">v2 routes</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Tenant-scoped auth remains the default API contract.
                        </p>
                      </div>
                      <div className="rounded-sm bg-muted/30 p-4">
                        <LockKeyhole className="mb-3 size-5 text-muted-foreground" />
                        <p className="font-medium">Credential masking</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Keys stay server-side unless explicitly exposed.
                        </p>
                      </div>
                      <div className="rounded-sm bg-muted/30 p-4">
                        <KeyRound className="mb-3 size-5 text-muted-foreground" />
                        <p className="font-medium">Rotation policy</p>
                        <p className="mt-2 text-sm text-muted-foreground">
                          New keys inherit the workspace rotation window.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "alerts" && (
              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader className="gap-4 lg:grid-cols-[1fr_auto]">
                  <div>
                    <CardTitle>Notification routing</CardTitle>
                    <CardDescription>
                      Send admin events to the right inboxes and service hooks.
                    </CardDescription>
                  </div>
                  <CardAction className="justify-self-start lg:justify-self-end">
                    <Badge className="rounded-sm" variant="outline">
                      {activeTab}
                    </Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="grid gap-4 xl:grid-cols-[1fr_1fr]">
                  <div className="space-y-2">
                    <Label htmlFor="webhook-url">Webhook URL</Label>
                    <div className="relative">
                      <Webhook className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="webhook-url"
                        className="pl-9"
                        placeholder="https://hooks.example.com/cosavu"
                        value={settings.webhookUrl}
                        onChange={(event) =>
                          updateSettings({ webhookUrl: event.target.value })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="flex items-center justify-between gap-3 rounded-sm bg-muted/30 p-4">
                      <div>
                        <p className="font-medium">Usage</p>
                        <p className="text-sm text-muted-foreground">
                          Quota alerts
                        </p>
                      </div>
                      <Switch
                        checked={settings.usageAlerts}
                        onCheckedChange={(checked) =>
                          updateSettings({ usageAlerts: checked })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-sm bg-muted/30 p-4">
                      <div>
                        <p className="font-medium">Billing</p>
                        <p className="text-sm text-muted-foreground">
                          Invoice events
                        </p>
                      </div>
                      <Switch
                        checked={settings.billingAlerts}
                        onCheckedChange={(checked) =>
                          updateSettings({ billingAlerts: checked })
                        }
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-sm bg-muted/30 p-4">
                      <div>
                        <p className="font-medium">Sync</p>
                        <p className="text-sm text-muted-foreground">
                          Warehouse jobs
                        </p>
                      </div>
                      <Switch
                        checked={settings.syncAlerts}
                        onCheckedChange={(checked) =>
                          updateSettings({ syncAlerts: checked })
                        }
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
