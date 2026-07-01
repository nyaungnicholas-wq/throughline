"use client";

import {
  BarChart3,
  CheckSquare,
  ChevronsUpDown,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu as MenuIcon,
  Plus,
  Settings,
  Sparkles,
  Target,
  Trash2,
  UserCog,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Role } from "@/db/schema";
import { signOutAction } from "@/lib/actions/auth";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuItem } from "@/components/ui/menu";
import { AssistantButton } from "@/components/ai/AssistantButton";
import { GlobalSearch } from "@/components/shell/GlobalSearch";
import { NewBoardButton } from "@/components/shell/NewBoardButton";
import { NotificationBell } from "@/components/shell/NotificationBell";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { cn } from "@/lib/cn";

type OrgRef = { slug: string; name: string };
type BoardRef = { id: string; name: string };

/** Defined at module scope (not inside AppShell) so React keeps the same component
    type across renders instead of remounting every nav link. */
function NavLink({ href, icon, label, exact }: { href: string; icon: React.ReactNode; label: string; exact?: boolean }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
        active
          ? "bg-white/15 font-medium text-white before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-indigo-300"
          : "text-indigo-200/80 hover:bg-white/10 hover:text-white",
      )}
    >
      {icon}
      {label}
    </Link>
  );
}

export function AppShell({
  org,
  role,
  user,
  orgs,
  boards,
  notifInitial,
  aiLive,
  approvalCount,
  children,
}: {
  org: OrgRef;
  role: Role;
  user: { email: string; name: string | null };
  orgs: OrgRef[];
  boards: BoardRef[];
  notifInitial: { rows: never[]; unread: number } | { rows: unknown[]; unread: number };
  aiLive: boolean;
  approvalCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const base = `/${org.slug}`;
  const isManager = role === "owner" || role === "manager";
  const [mobileNav, setMobileNav] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => {
    setMobileNav(false);
  }, [pathname]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile backdrop */}
      {mobileNav && <div className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden" onClick={() => setMobileNav(false)} />}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0",
          mobileNav ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
        style={{ background: "var(--sidebar)" }}
      >
        <div className="px-3 py-3">
          <Menu
            width={230}
            trigger={({ toggle }) => (
              <button
                onClick={toggle}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-white/10"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500 text-white">
                  <Sparkles size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-white">{org.name}</div>
                  <div className="text-[11px] capitalize text-indigo-300">{role}</div>
                </div>
                <ChevronsUpDown size={15} className="text-indigo-300" />
              </button>
            )}
          >
            {(close) => (
              <>
                <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Workspaces</div>
                {orgs.map((o) => (
                  <MenuItem as={Link} key={o.slug} href={`/${o.slug}`} onClick={close}>
                    {o.name}
                  </MenuItem>
                ))}
                <div className="my-1 border-t border-slate-100" />
                <MenuItem as={Link} href="/onboarding" onClick={close}>
                  <Plus size={14} /> New workspace
                </MenuItem>
              </>
            )}
          </Menu>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto tl-scroll px-3 pb-4">
          <NavLink href={base} icon={<CheckSquare size={16} />} label="Boards" exact />

          <div className="mt-2 mb-1 flex items-center justify-between px-3">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-400">Your boards</span>
          </div>
          <div className="space-y-0.5">
            {boards.length === 0 && <p className="px-3 py-1 text-xs text-indigo-300/60">No boards yet</p>}
            {boards.map((b) => {
              const href = `${base}/boards/${b.id}`;
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <Link
                  key={b.id}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 truncate rounded-lg px-3 py-1.5 text-sm",
                    active ? "bg-white/15 font-medium text-white" : "text-indigo-200/70 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
                  <span className="truncate">{b.name}</span>
                </Link>
              );
            })}
          </div>
          {isManager && (
            <div className="px-1 pt-2">
              <NewBoardButton orgSlug={org.slug} />
            </div>
          )}

          <div className="my-3 border-t border-white/10" />
          <NavLink href={`${base}/my-work`} icon={<ListChecks size={16} />} label="My Work" />
          {isManager && (
            <NavLink href={`${base}/dashboard`} icon={<LayoutDashboard size={16} />} label="Dashboard" />
          )}
          {isManager && (
            <Link
              href={`${base}/approvals`}
              aria-current={pathname.startsWith(`${base}/approvals`) ? "page" : undefined}
              className={cn(
                "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors duration-150",
                pathname.startsWith(`${base}/approvals`)
                  ? "bg-white/15 font-medium text-white before:absolute before:inset-y-2 before:left-0 before:w-0.5 before:rounded-full before:bg-indigo-300"
                  : "text-indigo-200/80 hover:bg-white/10 hover:text-white",
              )}
            >
              <Inbox size={16} /> Approvals
              {approvalCount > 0 && (
                <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {approvalCount}
                </span>
              )}
            </Link>
          )}
          {isManager && <NavLink href={`${base}/reports`} icon={<BarChart3 size={16} />} label="Reports" />}
          {isManager && <NavLink href={`${base}/goals`} icon={<Target size={16} />} label="Goals" />}
          <NavLink href={`${base}/members`} icon={<Users size={16} />} label="Members" />
          {isManager && <NavLink href={`${base}/trash`} icon={<Trash2 size={16} />} label="Trash" />}
          {role === "owner" && <NavLink href={`${base}/settings`} icon={<Settings size={16} />} label="Settings" />}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setMobileNav(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Open navigation"
            >
              <MenuIcon size={20} />
            </button>
            <GlobalSearch orgSlug={org.slug} isManager={isManager} />
          </div>
          <div className="flex items-center gap-2">
            <AssistantButton orgSlug={org.slug} aiLive={aiLive} />
            <ThemeToggle />
            <NotificationBell orgSlug={org.slug} initial={notifInitial as { rows: never[]; unread: number }} />
          <Menu
            align="right"
            width={220}
            trigger={({ toggle }) => (
              <button onClick={toggle} className="ml-1 flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-slate-100">
                <Avatar name={user.name} email={user.email} />
                <span className="hidden text-sm font-medium text-slate-700 sm:block">{user.name ?? user.email}</span>
              </button>
            )}
          >
            {() => (
              <>
                <div className="px-3 py-2">
                  <div className="text-sm font-medium text-slate-800">{user.name ?? "Member"}</div>
                  <div className="text-xs text-slate-400">{user.email}</div>
                </div>
                <div className="my-1 border-t border-slate-100" />
                <MenuItem as={Link} href={`${base}/account`}><UserCog size={14} /> Account</MenuItem>
                <form action={signOutAction}>
                  <MenuItem type="submit"><LogOut size={14} /> Sign out</MenuItem>
                </form>
              </>
            )}
          </Menu>
          </div>
        </header>

        <main className="flex-1 overflow-auto tl-scroll">{children}</main>
      </div>
    </div>
  );
}
