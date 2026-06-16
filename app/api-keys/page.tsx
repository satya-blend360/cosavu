"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import {
  SidebarProvider,
  SidebarInset,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/app-sidebar"
import {
  Plus,
  Copy,
  Check,
  Eye,
  EyeOff,
  RefreshCw,
  Search,
  MoreVertical,
  X,
} from "lucide-react"
import { watchConsoleAuth, type ConsoleUser } from "@/lib/console-auth"
import { createApiKey, getApiKeys } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type ApiKeyRecord = {
  id: string
  key_string?: string | null
  user_name?: string | null
  created_at?: string | null
}

export default function ApiKeysPage() {
  const router = useRouter()
  const [keys, setKeys] = useState<ApiKeyRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [user, setUser] = useState<ConsoleUser | null>(null)
  const [showPrimary, setShowPrimary] = useState(false)

  const fetchKeys = async (email?: string) => {
    setLoading(true)
    const { data } = await getApiKeys("default", email)
    if (data) setKeys(data as ApiKeyRecord[])
    setLoading(false)
  }

  useEffect(() => {
    const unsubscribe = watchConsoleAuth(async (currentUser) => {
      if (!currentUser) {
        router.push("/login")
      } else {
        setUser(currentUser)
        if (currentUser.email) {
          fetchKeys(currentUser.email)
        }
      }
    })
    return () => unsubscribe()
  }, [router])

  const handleCreateKey = async () => {
    if (!user) return
    setCreating(true)
    const { api_key } = await createApiKey(
      user.displayName || user.email?.split("@")[0] || "User",
      user.email || "unknown@cosavu.com",
      "default"
    )

    if (api_key) {
      setNewKey(api_key)
      fetchKeys(user.email || undefined)
    }
    setCreating(false)
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  if (loading && keys.length === 0) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-background text-sm text-muted-foreground">
        Syncing Credentials...
      </div>
    )
  }

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background tracking-tight text-foreground">
        <AppSidebar />
        <SidebarInset className="relative flex h-screen w-full flex-col overflow-y-auto shadow-none">
          <header className="sticky top-0 z-50 flex h-14 shrink-0 items-center gap-2 bg-background px-4">
            <SidebarTrigger className="-ml-2 text-muted-foreground hover:text-foreground" />
            <div className="mx-2 h-4 w-px bg-border" />
            <h1 className="text-sm font-medium text-muted-foreground">
              System Administration / API Keys
            </h1>
          </header>

          <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-10 p-6 lg:p-10">
            {/* Primary Key Action Card */}
            <div
              className={cn(
                "mx-auto flex w-full max-w-lg flex-col gap-6 rounded-[2.5rem] border border-zinc-100 bg-background p-8 shadow-2xl shadow-zinc-200/50 transition-all duration-700 md:p-10",
                newKey
                  ? "pointer-events-none scale-95 opacity-10 blur-xl"
                  : "opacity-100"
              )}
            >
              <div className="flex w-full items-start justify-between">
                <div className="space-y-0.5">
                  <h2 className="text-lg font-bold tracking-tight text-foreground">
                    Your Cosavu API Key
                  </h2>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    System-wide integration credential
                  </p>
                </div>
                <button className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/50 text-muted-foreground transition-colors hover:bg-muted">
                  <X className="size-4" />
                </button>
              </div>

              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                    Active Token
                  </label>
                  <div className="group flex w-full items-center justify-between rounded-xl border border-transparent bg-zinc-100/80 p-4 transition-all hover:border-zinc-200 dark:bg-white/5 dark:hover:border-white/10">
                    <code className="font-mono text-sm font-bold tracking-[0.1em] text-foreground/70">
                      {showPrimary
                        ? keys[0]?.key_string || "No key available"
                        : "****************************"}
                    </code>
                    <button
                      className="p-1 text-muted-foreground transition-colors hover:text-foreground"
                      onClick={() => setShowPrimary(!showPrimary)}
                    >
                      {showPrimary ? (
                        <EyeOff className="size-3.5" />
                      ) : (
                        <Eye className="size-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase">
                      Usage
                    </span>
                    <span className="text-xs font-bold text-foreground">
                      1,482 / 5,000
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-white/5">
                    <div className="h-full w-[29%] bg-blue-600" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button
                  className="h-11 w-full gap-2 rounded-full bg-blue-600 text-sm font-bold text-white shadow-lg shadow-blue-500/20 transition-all hover:bg-blue-700 active:scale-[0.98]"
                  onClick={() =>
                    copyToClipboard(keys[0]?.key_string || "", "primary")
                  }
                >
                  <Copy className="size-4" />
                  Copy Integration Key
                </Button>

                <Button
                  variant="ghost"
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-full text-xs font-bold text-muted-foreground transition-all hover:bg-muted/50 hover:text-foreground"
                  onClick={handleCreateKey}
                  disabled={creating}
                >
                  {creating ? (
                    <RefreshCw className="size-3.5 animate-spin" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  Generate new key
                </Button>
              </div>
            </div>

            {/* New Key Alert (Success States) */}
            {newKey && (
              <div className="group relative animate-in overflow-hidden rounded-3xl bg-background p-10 shadow-2xl shadow-emerald-500/5 duration-500 fade-in slide-in-from-top-4 md:p-14">
                <div className="relative z-10 flex flex-col items-center gap-8 text-center">
                  <div className="space-y-3">
                    <div className="mb-4 flex items-center justify-center gap-3 text-emerald-500">
                      <div className="flex size-12 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10">
                        <Check className="size-6" strokeWidth={2.5} />
                      </div>
                    </div>
                    <h3 className="text-2xl font-bold tracking-tight">
                      Credential Issued Successfully
                    </h3>
                    <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                      Save this key immediately. For security reasons,{" "}
                      <span className="font-semibold text-foreground underline decoration-emerald-500/30 underline-offset-4">
                        we cannot show this to you again
                      </span>{" "}
                      after you leave this page.
                    </p>
                  </div>

                  <div className="w-full max-w-md rounded-[2rem] border-none bg-muted/50 p-6 shadow-inner transition-all duration-500 group-hover:bg-muted/80">
                    <div className="flex items-center gap-4">
                      <code className="flex-1 font-mono text-sm font-bold tracking-tight break-all text-foreground/80 select-all">
                        {newKey}
                      </code>
                      <Button
                        size="icon"
                        className="h-12 w-12 shrink-0 rounded-2xl bg-foreground text-background shadow-lg transition-all hover:scale-110 active:scale-95"
                        onClick={() => copyToClipboard(newKey, "new")}
                      >
                        {copiedId === "new" ? (
                          <Check className="size-5" />
                        ) : (
                          <Copy className="size-5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Decorative Elements */}
                <div className="absolute -top-24 -right-24 size-64 rounded-full bg-emerald-500/5 blur-[100px]" />
                <div className="absolute -bottom-24 -left-24 size-64 rounded-full bg-sky-500/5 blur-[100px]" />
              </div>
            )}

            {/* Keys Table - Portfolio Style */}
            <div className="overflow-hidden rounded-3xl border border-border/50 bg-background p-6 shadow-sm md:p-8">
              {/* List Header controls */}
              <div className="mb-10 flex flex-col items-center justify-between gap-6 md:flex-row">
                <div className="relative w-full max-w-sm">
                  <Search className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="h-12 rounded-full border-none bg-muted pl-11 shadow-none focus-visible:ring-1 focus-visible:ring-emerald-500/20"
                    placeholder="Search tokens or owners..."
                  />
                </div>
                <div className="flex w-full items-center gap-2 overflow-x-auto pb-2 md:w-auto md:pb-0">
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-border bg-background px-6 text-xs font-bold shadow-sm"
                  >
                    Tokens
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-border bg-muted/50 px-6 text-xs font-bold text-muted-foreground hover:bg-background"
                  >
                    Prod
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 rounded-full border-border bg-muted/50 px-6 text-xs font-bold text-muted-foreground hover:bg-background"
                  >
                    Dev
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {keys.length > 0 ? (
                  keys.map((key) => (
                    <div
                      key={key.id}
                      className="group flex cursor-pointer items-center justify-between rounded-3xl border border-transparent p-4 transition-all hover:border-border/30 hover:bg-muted/30 md:p-6"
                    >
                      <div className="flex items-center gap-5">
                        <div className="flex size-14 items-center justify-center rounded-2xl border border-border/30 bg-muted/80 text-[10px] font-bold tracking-[0.2em] text-muted-foreground/80 shadow-sm transition-all duration-300 group-hover:bg-background group-hover:text-emerald-500">
                          {key.user_name?.substring(0, 3).toUpperCase() ||
                            "CSV"}
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-bold text-foreground capitalize transition-transform group-hover:translate-x-1">
                            {key.user_name || "Development Key"}
                          </span>
                          <span className="text-[11px] font-bold tracking-tight text-muted-foreground/60">
                            ISSUED{" "}
                            {key.created_at
                              ? new Date(key.created_at)
                                  .toLocaleDateString(undefined, {
                                    month: "short",
                                    year: "numeric",
                                  })
                                  .toUpperCase()
                              : "NOT ISSUED"}
                          </span>
                        </div>
                      </div>

                      <div className="hidden lg:block">
                        <span className="rounded-full border border-border/40 bg-muted/60 px-3 py-1 text-[9px] font-bold tracking-widest text-muted-foreground/80">
                          {key.user_name?.toLowerCase().includes("prod")
                            ? "PRODUCTION"
                            : "INTEGRATION"}
                        </span>
                      </div>

                      <div className="flex items-center gap-6 md:gap-12">
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[9px] font-bold tracking-[0.2em] text-muted-foreground/30 uppercase">
                            Usage
                          </span>
                          <span className="text-sm font-bold text-foreground">
                            $0.00
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 rounded-full text-muted-foreground transition-all hover:bg-background hover:text-foreground"
                          >
                            <MoreVertical className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="animate-in py-24 text-center duration-1000 fade-in">
                    <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-3xl bg-muted/50">
                      <Search className="size-6 text-muted-foreground/30" />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      No tokens provisioned for{" "}
                      <span className="font-bold text-foreground">
                        {user?.email}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground/40">
                      Try clearing your filters or issuing a new key above.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  )
}
