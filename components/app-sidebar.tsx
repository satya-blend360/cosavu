"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart2,
  List,
  Database,
  Unplug,
  Bot,
  KeyRound,
  Settings,
  Crown,
  ChevronDown,
  Rocket,
  Plus,
  CreditCard,
  LogOut,
} from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  signOutConsole,
  watchConsoleAuth,
  type ConsoleUser,
} from "@/lib/console-auth"

function formatProfileName(user: ConsoleUser | null) {
  const displayName = user?.displayName?.trim()
  if (displayName) return displayName

  const emailName = user?.email
    ?.split("@")[0]
    ?.replace(/[._-]+/g, " ")
    .trim()

  if (!emailName) return "Workspace user"

  return emailName.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

function getProfileInitial(name: string, email?: string | null) {
  return (name || email || "U").trim().charAt(0).toUpperCase() || "U"
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
  const router = useRouter()
  const [authUser, setAuthUser] = React.useState<ConsoleUser | null>(null)
  const isActive = React.useCallback(
    (href: string) =>
      href === "/"
        ? pathname === "/"
        : pathname === href || pathname.startsWith(`${href}/`),
    [pathname]
  )
  const profileName = formatProfileName(authUser)
  const profileEmail = authUser?.email || "Signed in"
  const profileInitial = getProfileInitial(profileName, authUser?.email)

  React.useEffect(() => {
    return watchConsoleAuth(setAuthUser)
  }, [])

  const handleLogout = async () => {
    await signOutConsole()
    router.push("/login")
  }

  return (
    <Sidebar variant="sidebar" className="border-none shadow-none" {...props}>
      <SidebarHeader className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-indigo-500 text-white">
                    <Bot className="size-4" />
                  </div>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold text-foreground">
                      Cosavu
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      Team Workspace
                    </span>
                  </div>
                  <ChevronDown className="ml-auto size-4" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
                align="start"
                side={props.side === "right" ? "left" : "right"}
                sideOffset={4}
              >
                <DropdownMenuLabel className="text-xs text-muted-foreground">
                  Workspaces
                </DropdownMenuLabel>
                <DropdownMenuItem className="gap-2 p-2">
                  <div className="flex size-6 items-center justify-center rounded-sm border bg-indigo-500 text-white">
                    <Bot className="size-4" />
                  </div>
                  Cosavu
                  <DropdownMenuShortcut>⌘1</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem className="gap-2 p-2 opacity-50">
                  <div className="flex size-6 items-center justify-center rounded-sm border bg-muted">
                    <Plus className="size-4" />
                  </div>
                  Add workspace
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="gap-2 p-2">
                  <Settings className="size-4" />
                  Manage Workspace
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <SidebarMenu className="px-2">
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isActive("/")}
              className="font-medium"
            >
              <Link href="/">
                <Rocket className="mr-2 size-4" />
                Getting Started
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarGroup className="mt-4">
          <SidebarGroupLabel className="text-[10px] font-bold tracking-wider">
            Observability
          </SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive("/query-analytics")}
              >
                <Link href="/query-analytics">
                  <BarChart2 className="mr-2 size-4" />
                  Query Analytics
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/context-api")}>
                <Link href="/context-api">
                  <Bot className="mr-2 size-4" />
                  ContextAPI
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/system-logs")}>
                <Link href="/system-logs">
                  <List className="mr-2 size-4" />
                  System Logs
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold tracking-wider">
            Knowledge bases
          </SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/buckets")}>
                <Link href="/buckets">
                  <Database className="mr-2 size-4" />
                  Buckets
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/warehouse")}>
                <Link href="/warehouse">
                  <Unplug className="mr-2 size-4" />
                  On-Prem
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-bold tracking-wider">
            System administration
          </SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/tenants")}>
                <Link href="/tenants">
                  <Crown className="mr-2 size-4" />
                  Tenants
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/api")}>
                <Link href="/api">
                  <KeyRound className="mr-2 size-4" />
                  API Keys
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/billing")}>
                <Link href="/billing">
                  <CreditCard className="mr-2 size-4" />
                  Billing
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive("/admin-settings")}>
                <Link href="/admin-settings">
                  <Settings className="mr-2 size-4" />
                  Admin Settings
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex h-14 items-center gap-3 rounded-sm px-3 text-sm">
              <Avatar className="h-8 w-8 rounded-md">
                <AvatarFallback className="rounded-md bg-amber-600 text-xs font-bold text-white">
                  {profileInitial}
                </AvatarFallback>
              </Avatar>
              <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold text-foreground">
                  {profileName}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {profileEmail}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              className="mt-2 w-full justify-start rounded-sm text-muted-foreground hover:text-foreground"
              onClick={handleLogout}
            >
              <LogOut className="size-4" />
              Logout
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
