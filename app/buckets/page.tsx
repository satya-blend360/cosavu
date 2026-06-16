"use client"

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Box,
  Check,
  ChevronRight,
  Cloud,
  Copy,
  Database,
  FileText,
  HardDrive,
  Loader2,
  Moon,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sun,
  UploadCloud,
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  COSAVU_ENDPOINTS,
  createDataBucket,
  getLatestDataTenantKey,
  listDataBuckets,
  uploadDataFile,
} from "@/lib/cosavu-api"
import { watchConsoleAuth, type ConsoleUser } from "@/lib/console-auth"
import { isDemoStatsUser } from "@/lib/console-stats"

type BucketSystem = "car-0" | "car-1"
type BucketStatus = "ready" | "indexing" | "attention"

type BucketRecord = {
  id: string
  name: string
  s3Bucket: string
  s3Prefix: string
  region: string
  system: BucketSystem
  status: BucketStatus
  ownerEmail: string
  createdAt: string
  updatedAt: string
  fileCount: number
  totalBytes: number
  chunksIndexed: number
  encryption: "SSE-S3" | "SSE-KMS"
  retentionDays: number
}

type BucketFile = {
  id: string
  bucketId: string
  name: string
  size: number
  type: string
  s3Key: string
  chunksIndexed: number
  uploadedAt: string
  status: "stored" | "indexed"
}

type UploadDraftFile = {
  file: File
  name: string
  size: number
  type: string
  lastModified: number
}

const LOCAL_BUCKETS_STORAGE_PREFIX = "cosavu:buckets"
const LOCAL_BUCKET_FILES_STORAGE_PREFIX = "cosavu:bucket-files"
const SEEDED_BUCKET_IDS = new Set(["bucket-tenant-docs", "bucket-engram-cache"])
const SEEDED_BUCKET_FILE_IDS = new Set([
  "file-product-handbook",
  "file-policy",
  "file-engram-notes",
])

const REGION_OPTIONS = [
  { value: "us-east-1", label: "US East (N. Virginia)" },
  { value: "us-west-2", label: "US West (Oregon)" },
  { value: "ap-south-1", label: "Asia Pacific (Mumbai)" },
  { value: "eu-west-1", label: "Europe (Ireland)" },
]

const STATUS_LABELS: Record<BucketStatus, string> = {
  ready: "Ready",
  indexing: "Indexing",
  attention: "Needs attention",
}

function getBucketStorageKey(email?: string | null) {
  return `${LOCAL_BUCKETS_STORAGE_PREFIX}:${email?.toLowerCase() || "unknown"}`
}

function getFileStorageKey(email?: string | null) {
  return `${LOCAL_BUCKET_FILES_STORAGE_PREFIX}:${email?.toLowerCase() || "unknown"}`
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
  if (!value) return "None"

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value))
}

function slugify(value: string) {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42)

  return slug || "private-bucket"
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
  }

  return `${prefix}-${Date.now().toString(36)}`
}

function getTenantSlug(email?: string | null) {
  return slugify(email?.split("@")[0] || "cosavu")
}

function readLocalBuckets(email?: string | null) {
  if (typeof window === "undefined") return []

  try {
    const storedBuckets = window.localStorage.getItem(
      getBucketStorageKey(email)
    )
    if (!storedBuckets) return []

    const parsedBuckets = JSON.parse(storedBuckets)
    if (!Array.isArray(parsedBuckets)) return []

    return parsedBuckets.filter((bucket): bucket is BucketRecord => {
      return Boolean(
        bucket?.id &&
        bucket?.name &&
        bucket?.s3Bucket &&
        !SEEDED_BUCKET_IDS.has(bucket.id)
      )
    })
  } catch {
    return []
  }
}

function readLocalBucketFiles(email?: string | null) {
  if (typeof window === "undefined") return []

  try {
    const storedFiles = window.localStorage.getItem(getFileStorageKey(email))
    if (!storedFiles) return []

    const parsedFiles = JSON.parse(storedFiles)
    if (!Array.isArray(parsedFiles)) return []

    return parsedFiles.filter((file): file is BucketFile => {
      return Boolean(
        file?.id &&
        file?.bucketId &&
        file?.name &&
        !SEEDED_BUCKET_FILE_IDS.has(file.id) &&
        !SEEDED_BUCKET_IDS.has(file.bucketId)
      )
    })
  } catch {
    return []
  }
}

function saveLocalBuckets(
  email: string | null | undefined,
  buckets: BucketRecord[]
) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(
    getBucketStorageKey(email),
    JSON.stringify(buckets)
  )
}

function saveLocalBucketFiles(
  email: string | null | undefined,
  files: BucketFile[]
) {
  if (typeof window === "undefined") return

  window.localStorage.setItem(getFileStorageKey(email), JSON.stringify(files))
}

function createDefaultBuckets(email?: string | null) {
  if (!isDemoStatsUser(email)) {
    return { buckets: [], files: [] } satisfies {
      buckets: BucketRecord[]
      files: BucketFile[]
    }
  }

  const now = new Date().toISOString()
  const ownerEmail = email || "workspace@cosavu.com"
  const tenantSlug = getTenantSlug(email)

  const buckets: BucketRecord[] = [
    {
      id: "demo-million-scale-primary",
      name: "Million scale knowledge lake",
      s3Bucket: `cosavu-private-${tenantSlug}-million-scale`,
      s3Prefix: `${tenantSlug}/million-scale/`,
      region: "us-east-1",
      system: "car-0",
      status: "ready",
      ownerEmail,
      createdAt: now,
      updatedAt: now,
      fileCount: 64_820_453,
      totalBytes: 8_420_681_493_217_389,
      chunksIndexed: 984_220_137,
      encryption: "SSE-KMS",
      retentionDays: 365,
    },
    {
      id: "demo-retrieval-archive",
      name: "Retrieval archive",
      s3Bucket: `cosavu-private-${tenantSlug}-retrieval-archive`,
      s3Prefix: `${tenantSlug}/retrieval-archive/`,
      region: "ap-south-1",
      system: "car-1",
      status: "ready",
      ownerEmail,
      createdAt: now,
      updatedAt: now,
      fileCount: 18_730_219,
      totalBytes: 2_180_319_847_562_913,
      chunksIndexed: 342_880_417,
      encryption: "SSE-KMS",
      retentionDays: 180,
    },
  ]

  const files: BucketFile[] = [
    {
      id: "demo-million-rollup",
      bucketId: "demo-million-scale-primary",
      name: "million-scale-rollup.parquet",
      size: 920_318_427_913,
      type: "application/octet-stream",
      s3Key: `${tenantSlug}/million-scale/demo-million-rollup/million-scale-rollup.parquet`,
      chunksIndexed: 42_800_317,
      uploadedAt: now,
      status: "indexed",
    },
  ]

  return { buckets, files }
}

function getStatusVariant(status: BucketStatus) {
  if (status === "ready") return "secondary"
  if (status === "indexing") return "outline"

  return "destructive"
}

export default function BucketsPage() {
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [user, setUser] = useState<ConsoleUser | null>(null)
  const [buckets, setBuckets] = useState<BucketRecord[]>([])
  const [bucketFiles, setBucketFiles] = useState<BucketFile[]>([])
  const [selectedBucketId, setSelectedBucketId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [systemFilter, setSystemFilter] = useState("all")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [newBucketName, setNewBucketName] = useState("")
  const [newBucketSystem, setNewBucketSystem] = useState<BucketSystem>("car-0")
  const [newBucketRegion, setNewBucketRegion] = useState("us-east-1")
  const [newBucketRetention, setNewBucketRetention] = useState("90")
  const [uploadFiles, setUploadFiles] = useState<UploadDraftFile[]>([])

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

      const storedBuckets = readLocalBuckets(currentUser.email)
      const storedFiles = readLocalBucketFiles(currentUser.email)
      const defaults = createDefaultBuckets(currentUser.email)
      const shouldMergeDemo = isDemoStatsUser(currentUser.email)
      const nextBuckets = shouldMergeDemo
        ? [
            ...defaults.buckets,
            ...storedBuckets.filter(
              (bucket) =>
                !defaults.buckets.some((demo) => demo.id === bucket.id)
            ),
          ]
        : storedBuckets.length > 0
          ? storedBuckets
          : defaults.buckets
      const nextFiles = shouldMergeDemo
        ? [
            ...defaults.files,
            ...storedFiles.filter(
              (file) => !defaults.files.some((demo) => demo.id === file.id)
            ),
          ]
        : storedFiles.length > 0
          ? storedFiles
          : defaults.files

      if (shouldMergeDemo || storedBuckets.length === 0) {
        saveLocalBuckets(currentUser.email, nextBuckets)
      }

      if (shouldMergeDemo || storedFiles.length === 0) {
        saveLocalBucketFiles(currentUser.email, nextFiles)
      }

      setUser(currentUser)
      setBuckets(nextBuckets)
      setBucketFiles(nextFiles)
      setSelectedBucketId(nextBuckets[0]?.id ?? null)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [router])

  const selectedBucket = useMemo(() => {
    return (
      buckets.find((bucket) => bucket.id === selectedBucketId) || buckets[0]
    )
  }, [buckets, selectedBucketId])

  const selectedBucketFiles = useMemo(() => {
    if (!selectedBucket) return []

    return bucketFiles.filter((file) => file.bucketId === selectedBucket.id)
  }, [bucketFiles, selectedBucket])

  const filteredBuckets = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return buckets.filter((bucket) => {
      const matchesSystem =
        systemFilter === "all" || bucket.system === systemFilter
      const matchesQuery =
        !query ||
        bucket.name.toLowerCase().includes(query) ||
        bucket.s3Bucket.toLowerCase().includes(query) ||
        bucket.s3Prefix.toLowerCase().includes(query)

      return matchesSystem && matchesQuery
    })
  }, [buckets, searchQuery, systemFilter])

  const stats = useMemo(() => {
    const totalBytes = buckets.reduce(
      (sum, bucket) => sum + bucket.totalBytes,
      0
    )
    const chunksIndexed = buckets.reduce(
      (sum, bucket) => sum + bucket.chunksIndexed,
      0
    )
    const indexingCount = buckets.filter(
      (bucket) => bucket.status === "indexing"
    ).length

    return {
      totalBytes,
      chunksIndexed,
      indexingCount,
      fileCount: bucketFiles.length,
    }
  }, [bucketFiles.length, buckets])

  const refreshBuckets = async () => {
    setRefreshing(true)

    if (isDemoStatsUser(user?.email)) {
      const storedBuckets = readLocalBuckets(user?.email)
      const storedFiles = readLocalBucketFiles(user?.email)
      const defaults = createDefaultBuckets(user?.email)
      const nextBuckets = [
        ...defaults.buckets,
        ...storedBuckets.filter(
          (bucket) => !defaults.buckets.some((demo) => demo.id === bucket.id)
        ),
      ]
      const nextFiles = [
        ...defaults.files,
        ...storedFiles.filter(
          (file) => !defaults.files.some((demo) => demo.id === file.id)
        ),
      ]

      saveLocalBuckets(user?.email, nextBuckets)
      saveLocalBucketFiles(user?.email, nextFiles)
      setBuckets(nextBuckets)
      setBucketFiles(nextFiles)
      setSelectedBucketId((currentId) => currentId || nextBuckets[0]?.id)
      window.setTimeout(() => setRefreshing(false), 650)
      return
    }

    try {
      const dataTenantKey = getLatestDataTenantKey(user?.email)
      if (dataTenantKey) {
        const realBuckets = await listDataBuckets(dataTenantKey.apiKey)
        if (realBuckets.length > 0) {
          const now = new Date().toISOString()
          const nextBuckets: BucketRecord[] = realBuckets.map((bucket) => ({
            id: `bucket-${bucket.name}`,
            name: bucket.name,
            s3Bucket: `cosavu-private-${dataTenantKey.tenantSlug}-${bucket.name}`,
            s3Prefix: `${dataTenantKey.tenantSlug}/${bucket.name}/`,
            region: newBucketRegion,
            system: bucket.system as BucketSystem,
            status: "ready",
            ownerEmail: user?.email || "workspace@cosavu.com",
            createdAt: now,
            updatedAt: now,
            fileCount: bucket.total_chunks > 0 ? 1 : 0,
            totalBytes: 0,
            chunksIndexed: bucket.total_chunks,
            encryption: "SSE-S3",
            retentionDays: Number(newBucketRetention) || 90,
          }))

          saveLocalBuckets(user?.email, nextBuckets)
          setBuckets(nextBuckets)
          setSelectedBucketId(
            (currentId) => currentId || nextBuckets[0]?.id || null
          )
          return
        }
      }
    } catch (error) {
      console.error("DataAPI bucket sync failed:", error)
      setErrorMessage(
        "Could not sync real DataAPI buckets. Showing the last local snapshot."
      )
    } finally {
      setRefreshing(false)
    }

    const storedBuckets = readLocalBuckets(user?.email)
    const storedFiles = readLocalBucketFiles(user?.email)

    if (storedBuckets.length > 0) {
      setBuckets(storedBuckets)
      setSelectedBucketId((currentId) => currentId || storedBuckets[0]?.id)
    }

    if (storedFiles.length > 0) {
      setBucketFiles(storedFiles)
    }
  }

  const openUploadSheet = () => {
    setErrorMessage(null)
    setNewBucketName("")
    setNewBucketSystem("car-0")
    setNewBucketRegion("us-east-1")
    setNewBucketRetention("90")
    setUploadFiles([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
    setUploadSheetOpen(true)
  }

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).map((file) => ({
      file,
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      lastModified: file.lastModified,
    }))

    setUploadFiles(files)
    if (files.length > 0 && !newBucketName.trim()) {
      const firstFileName = files[0].name.replace(/\.[^.]+$/, "")
      setNewBucketName(firstFileName)
    }
  }

  const createBucketFromUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const name = newBucketName.trim()
    if (!name) {
      setErrorMessage("Enter a bucket name.")
      return
    }

    const bucketSlug = slugify(name)
    if (
      buckets.some(
        (bucket) =>
          bucket.name.toLowerCase() === name.toLowerCase() ||
          slugify(bucket.name) === bucketSlug
      )
    ) {
      setErrorMessage("A bucket with that name already exists.")
      return
    }

    const dataTenantKey = getLatestDataTenantKey(user?.email)
    if (!dataTenantKey) {
      setErrorMessage(
        "You need an active DataAPI tenant to create buckets. Please go to the Tenants page and create one first."
      )
      return
    }

    setUploading(true)
    setErrorMessage(null)

    try {
      const realBucket = await createDataBucket({
        apiKey: dataTenantKey.apiKey,
        name: bucketSlug,
        system: newBucketSystem,
      })
      const actualBucketSlug = realBucket.name

      let uploadError: unknown = null
      const uploadedFiles =
        uploadFiles.length > 0
          ? await Promise.all(
              uploadFiles.map((file) =>
                uploadDataFile({
                  apiKey: dataTenantKey.apiKey,
                  file: file.file,
                  system: newBucketSystem,
                  collection: actualBucketSlug,
                })
              )
            ).catch((error) => {
              uploadError = error
              return []
            })
          : []

      if (uploadError) {
        console.error("DataAPI bucket file upload failed:", uploadError)
      }

      const now = new Date().toISOString()
      const tenantSlug = dataTenantKey.tenantSlug || getTenantSlug(user?.email)
      const bucketId = makeId("bucket")
      const bucketSuffix = bucketId.replace("bucket-", "")
      const totalBytes = uploadedFiles.reduce(
        (sum, _file, index) => sum + (uploadFiles[index]?.size || 0),
        0
      )
      const chunksIndexed = uploadedFiles.reduce(
        (sum, file) => sum + file.chunks_indexed,
        0
      )

      const createdBucket: BucketRecord = {
        id: bucketId,
        name: actualBucketSlug,
        s3Bucket: `cosavu-private-${tenantSlug}-${actualBucketSlug}-${bucketSuffix}`,
        s3Prefix: `${tenantSlug}/${actualBucketSlug}/`,
        region: newBucketRegion,
        system: realBucket.system as BucketSystem,
        status: uploadError ? "attention" : "ready",
        ownerEmail: user?.email || "workspace@cosavu.com",
        createdAt: now,
        updatedAt: now,
        fileCount: uploadedFiles.length,
        totalBytes,
        chunksIndexed,
        encryption: "SSE-S3",
        retentionDays: Number(newBucketRetention) || 90,
      }

      const createdFiles: BucketFile[] = uploadedFiles.map(
        (uploadedFile, index) => {
          const file = uploadFiles[index]

          return {
            id: uploadedFile.id,
            bucketId,
            name: uploadedFile.filename || file?.name || "uploaded-file",
            size: file?.size || 0,
            type: file?.type || "application/octet-stream",
            s3Key: `${createdBucket.s3Prefix}${uploadedFile.id}/${
              file?.name || uploadedFile.filename || "uploaded-file"
            }`,
            chunksIndexed: uploadedFile.chunks_indexed,
            uploadedAt: now,
            status: "indexed",
          }
        }
      )

      const nextBuckets = [createdBucket, ...buckets]
      const nextFiles = [...createdFiles, ...bucketFiles]

      saveLocalBuckets(user?.email, nextBuckets)
      saveLocalBucketFiles(user?.email, nextFiles)
      setBuckets(nextBuckets)
      setBucketFiles(nextFiles)
      setSelectedBucketId(createdBucket.id)
      setUploadSheetOpen(false)
      setUploadFiles([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
      if (uploadError) {
        setErrorMessage(
          `Bucket was created, but file upload failed: ${getErrorMessage(
            uploadError,
            "check the DataAPI file upload endpoint."
          )}`
        )
      }
    } catch (error) {
      console.error("DataAPI bucket upload failed:", error)
      setErrorMessage(
        `Could not create a DataAPI bucket: ${getErrorMessage(
          error,
          "check the tenant key and DataAPI deployment."
        )}`
      )
    } finally {
      setUploading(false)
    }
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
                <BreadcrumbItem>Knowledge bases</BreadcrumbItem>
                <BreadcrumbSeparator>
                  <ChevronRight className="size-3.5" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbPage>Buckets</BreadcrumbPage>
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
                    aria-label="Refresh buckets"
                    disabled={refreshing}
                    onClick={refreshBuckets}
                  >
                    <RefreshCw
                      className={refreshing ? "size-4 animate-spin" : "size-4"}
                    />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh buckets</TooltipContent>
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
                      Private Cosavu Cloud Buckets
                    </Badge>
                    <Badge
                      className="w-fit rounded-sm font-mono"
                      variant="outline"
                    >
                      {COSAVU_ENDPOINTS.data.buckets}
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl font-semibold tracking-tight md:text-3xl">
                    Buckets (Isolated)
                  </CardTitle>
                  <CardDescription className="max-w-2xl">
                    Monitor tenant-private Cosavu AWS buckets, raw S3 objects,
                    and the CAR-0/CAR-1 index state created from uploaded files.
                  </CardDescription>
                </div>
                <CardAction className="col-span-full col-start-1 row-start-2 flex flex-wrap items-center gap-2 justify-self-start md:col-span-1 md:col-start-2 md:row-start-1 md:justify-self-end">
                  <Button
                    variant="outline"
                    className="rounded-sm"
                    onClick={refreshBuckets}
                    disabled={refreshing}
                  >
                    <RefreshCw
                      className={refreshing ? "size-4 animate-spin" : "size-4"}
                    />
                    Sync buckets
                  </Button>
                  <Button className="rounded-sm" onClick={openUploadSheet}>
                    <UploadCloud className="size-4" />
                    Upload files
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Buckets
                      </span>
                      <Box className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">{buckets.length}</p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Private files
                      </span>
                      <FileText className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">{stats.fileCount}</p>
                  </div>
                  <div className="rounded-sm bg-muted/30 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Storage
                      </span>
                      <HardDrive className="size-4 text-muted-foreground" />
                    </div>
                    <p className="text-2xl font-semibold">
                      {formatBytes(stats.totalBytes)}
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
                      {stats.chunksIndexed.toLocaleString()}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {errorMessage && !uploadSheetOpen && (
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
                    <CardTitle>Bucket monitor</CardTitle>
                    <CardDescription>
                      Tenant-isolated S3 storage and vector collection status.
                    </CardDescription>
                  </div>
                  <CardAction className="col-span-full col-start-1 row-start-2 flex w-full flex-col gap-2 justify-self-stretch sm:flex-row lg:col-span-1 lg:col-start-2 lg:row-start-1 lg:w-auto lg:justify-self-end">
                    <div className="relative w-full sm:w-72">
                      <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="h-9 rounded-sm pl-9"
                        placeholder="Search buckets..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                      />
                    </div>
                    <Tabs
                      value={systemFilter}
                      onValueChange={setSystemFilter}
                      className="w-full sm:w-auto"
                    >
                      <TabsList className="w-full rounded-sm sm:w-fit [&_[data-slot=tabs-trigger]]:rounded-sm">
                        <TabsTrigger className="rounded-sm" value="all">
                          All
                        </TabsTrigger>
                        <TabsTrigger className="rounded-sm" value="car-0">
                          CAR-0
                        </TabsTrigger>
                        <TabsTrigger className="rounded-sm" value="car-1">
                          CAR-1
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {filteredBuckets.length > 0 ? (
                      filteredBuckets.map((bucket) => {
                        const isSelected = selectedBucket?.id === bucket.id
                        const usagePercent = Math.min(
                          100,
                          Math.round(bucket.totalBytes / 200_000)
                        )

                        return (
                          <button
                            key={bucket.id}
                            type="button"
                            className={`w-full rounded-sm bg-muted/20 p-4 text-left transition-colors hover:bg-muted/35 ${
                              isSelected ? "ring-2 ring-primary/40" : ""
                            }`}
                            onClick={() => setSelectedBucketId(bucket.id)}
                          >
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,0.75fr)] lg:items-center">
                              <div className="flex min-w-0 items-start gap-4">
                                <div className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-background text-muted-foreground">
                                  <Cloud className="size-5" />
                                </div>
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <p className="truncate font-medium">
                                      {bucket.name}
                                    </p>
                                    <Badge
                                      className="rounded-sm"
                                      variant={getStatusVariant(bucket.status)}
                                    >
                                      {STATUS_LABELS[bucket.status]}
                                    </Badge>
                                    <Badge
                                      className="rounded-sm"
                                      variant="outline"
                                    >
                                      {bucket.system.toUpperCase()}
                                    </Badge>
                                  </div>
                                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                    s3://{bucket.s3Bucket}/{bucket.s3Prefix}
                                  </p>
                                </div>
                              </div>

                              <div className="space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                  <span className="text-muted-foreground">
                                    {formatBytes(bucket.totalBytes)}
                                  </span>
                                  <span className="font-medium">
                                    {bucket.fileCount} files
                                  </span>
                                </div>
                                <Progress
                                  value={usagePercent}
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
                          <Box className="size-5 text-muted-foreground" />
                        </div>
                        <p className="font-medium">No buckets match filters</p>
                        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                          Upload files to create a private Cosavu AWS bucket.
                        </p>
                        <Button
                          className="mt-5 rounded-sm"
                          onClick={openUploadSheet}
                        >
                          <UploadCloud className="size-4" />
                          Upload files
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-sm border-border/60 shadow-sm">
                <CardHeader>
                  <CardTitle>Selected bucket</CardTitle>
                  <CardDescription>
                    Private storage details and isolation metadata.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedBucket ? (
                    <>
                      <div className="rounded-sm bg-muted/30 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-lg font-semibold">
                              {selectedBucket.name}
                            </p>
                            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                              {selectedBucket.s3Bucket}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            className="rounded-sm"
                            aria-label="Copy S3 bucket"
                            onClick={() =>
                              copyToClipboard(
                                selectedBucket.s3Bucket,
                                selectedBucket.id
                              )
                            }
                          >
                            {copiedId === selectedBucket.id ? (
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
                            Region
                          </p>
                          <p className="mt-2 text-sm font-medium">
                            {selectedBucket.region}
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Encryption
                          </p>
                          <p className="mt-2 text-sm font-medium">
                            {selectedBucket.encryption}
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Created
                          </p>
                          <p className="mt-2 text-sm font-medium">
                            {formatDate(selectedBucket.createdAt)}
                          </p>
                        </div>
                        <div className="rounded-sm bg-muted/30 p-4">
                          <p className="text-sm text-muted-foreground">
                            Retention
                          </p>
                          <p className="mt-2 text-sm font-medium">
                            {selectedBucket.retentionDays} days
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3 rounded-sm bg-muted/30 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-medium">Tenant isolation</p>
                            <p className="text-sm text-muted-foreground">
                              Raw files are scoped under the tenant S3 prefix.
                            </p>
                          </div>
                          <ShieldCheck className="size-5 text-muted-foreground" />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="font-medium">Index system</p>
                            <p className="text-sm text-muted-foreground">
                              Uploads are parsed and indexed after storage.
                            </p>
                          </div>
                          <Badge className="rounded-sm" variant="secondary">
                            {selectedBucket.system.toUpperCase()}
                          </Badge>
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
                  <CardTitle>Files in bucket</CardTitle>
                  <CardDescription>
                    Original raw files saved before Cosavu parses and indexes
                    chunks.
                  </CardDescription>
                </div>
                <CardAction className="justify-self-start lg:justify-self-end">
                  <Badge className="rounded-sm" variant="outline">
                    {selectedBucketFiles.length} files
                  </Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {selectedBucketFiles.length > 0 ? (
                    selectedBucketFiles.map((file, index) => (
                      <div key={file.id}>
                        {index > 0 && <Separator className="mb-3" />}
                        <div className="grid gap-4 rounded-sm bg-muted/20 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                          <div className="flex min-w-0 items-center gap-4">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-background text-muted-foreground">
                              <FileText className="size-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium">
                                {file.name}
                              </p>
                              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                {file.s3Key}
                              </p>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-sm">
                            <span className="text-muted-foreground">
                              {formatBytes(file.size)}
                            </span>
                            <Badge
                              className="rounded-sm capitalize"
                              variant={
                                file.status === "indexed"
                                  ? "secondary"
                                  : "outline"
                              }
                            >
                              {file.status}
                            </Badge>
                            <span className="font-medium">
                              {file.chunksIndexed.toLocaleString()} chunks
                            </span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-sm bg-muted/20 px-6 py-16 text-center">
                      <div className="mb-4 flex size-12 items-center justify-center rounded-sm bg-muted">
                        <FileText className="size-5 text-muted-foreground" />
                      </div>
                      <p className="font-medium">No files in this bucket</p>
                      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                        Upload files to create a new private bucket and populate
                        its raw object ledger.
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </main>

          <Sheet open={uploadSheetOpen} onOpenChange={setUploadSheetOpen}>
            <SheetContent
              side="right"
              className="rounded-l-sm rounded-r-none sm:max-w-md"
            >
              <form
                className="flex h-full flex-col"
                onSubmit={createBucketFromUpload}
              >
                <SheetHeader>
                  <SheetTitle>Create bucket</SheetTitle>
                  <SheetDescription>
                    Create a private Cosavu AWS bucket. Files are optional and
                    are uploaded into the tenant-isolated S3 prefix through{" "}
                    {COSAVU_ENDPOINTS.data.filesUpload}.
                  </SheetDescription>
                </SheetHeader>

                <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-6">
                  <div className="space-y-2">
                    <Label htmlFor="bucket-name">Bucket name</Label>
                    <Input
                      id="bucket-name"
                      className="rounded-sm"
                      placeholder="Customer contracts"
                      value={newBucketName}
                      onChange={(event) => setNewBucketName(event.target.value)}
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="bucket-system">Index system</Label>
                      <Select
                        value={newBucketSystem}
                        onValueChange={(value) =>
                          setNewBucketSystem(value as BucketSystem)
                        }
                      >
                        <SelectTrigger
                          id="bucket-system"
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
                      <Label htmlFor="bucket-region">Region</Label>
                      <Select
                        value={newBucketRegion}
                        onValueChange={setNewBucketRegion}
                      >
                        <SelectTrigger
                          id="bucket-region"
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
                    <Label htmlFor="bucket-retention">Retention days</Label>
                    <Input
                      id="bucket-retention"
                      className="rounded-sm"
                      inputMode="numeric"
                      value={newBucketRetention}
                      onChange={(event) =>
                        setNewBucketRetention(event.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-3 rounded-sm bg-muted/30 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">Files</p>
                        <p className="text-sm text-muted-foreground">
                          PDF, DOCX, markdown, text, CSV, and code files can be
                          stored and indexed.
                        </p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        multiple
                        className="hidden"
                        onChange={handleFileSelection}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Plus className="size-4" />
                        Choose
                      </Button>
                    </div>

                    {uploadFiles.length > 0 ? (
                      <div className="space-y-2">
                        {uploadFiles.map((file) => (
                          <div
                            key={`${file.name}-${file.lastModified}`}
                            className="flex items-center justify-between gap-3 rounded-sm bg-background/70 p-3 text-sm"
                          >
                            <span className="min-w-0 truncate">
                              {file.name}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              {formatBytes(file.size)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
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
                    onClick={() => setUploadSheetOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    className="rounded-sm"
                    disabled={uploading || !newBucketName.trim()}
                  >
                    {uploading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <UploadCloud className="size-4" />
                    )}
                    Create bucket
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
