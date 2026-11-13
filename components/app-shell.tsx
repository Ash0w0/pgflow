"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Bell,
  Building2,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FileBarChart,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  Search,
  Settings,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { BrandMark, PoweredBy } from "./brand-mark";
import { useBrand } from "./brand-provider";
import { PlanBanner } from "./plan-banner";

const primaryNav = [
  { href: "/", label: "Overview", icon: LayoutDashboard, roles: ["owner", "manager", "accountant"] },
  { href: "/collections", label: "Collections", icon: CreditCard, roles: ["owner", "manager", "accountant"] },
  { href: "/residents", label: "Residents", icon: Users, roles: ["owner"] },
  { href: "/rooms", label: "Rooms & beds", icon: Building2, roles: ["owner"] },
  { href: "/operations", label: "Operations", icon: Wrench, roles: ["owner", "manager"] },
  { href: "/reports", label: "Reports", icon: FileBarChart, roles: ["owner", "accountant"] },
];

const operatorNav = [
  { href: "/operator", label: "Console", icon: Building2, roles: ["platform_operator"] },
];

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  accountant: "Accountant",
  tenant: "Resident",
  platform_operator: "Operator",
};

/**
 * Sample records for the guided demo only. These never render in a live workspace —
 * search, notifications and the language toggle are gated on `demoMode` because none of
 * them are backed by real data yet.
 */
const demoSearchRecords = [
  { title: "Aarav Shah (Resident, Room 101)", type: "Resident", href: "/residents" },
  { title: "Rohan Sharma (Resident, Room 204)", type: "Resident", href: "/residents" },
  { title: "Priya Patel (Resident, Room 302)", type: "Resident", href: "/residents" },
  { title: "Room 101 (Floor 1, 2 Beds)", type: "Room", href: "/rooms" },
  { title: "Room 204 (Floor 2, 3 Beds)", type: "Room", href: "/rooms" },
  { title: "RENT-INV-0726 (July Rent Invoice)", type: "Invoice", href: "/collections" },
  { title: "UTR-99201485 (Direct UPI Payment)", type: "Payment UTR", href: "/collections" },
];

const demoNotifications = [
  { title: "2 payment proofs pending", detail: "Awaiting owner review in the collections register." },
  { title: "July rent generated", detail: "Invoices ready for 48 active residents." },
  { title: "Room 204 ticket resolved", detail: "AC maintenance complete." },
];

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable
    || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export function AppShell({ children, demoMode, role }: { children: ReactNode; demoMode: boolean; role?: string }) {
  // Pages pass the signed-in role so staff only see sections they can open; owners and the demo see everything.
  const isOperator = role === "platform_operator";
  const visibleNav = isOperator
    ? operatorNav
    : role && role !== "owner" ? primaryNav.filter((item) => item.roles.includes(role)) : primaryNav;
  const showSettings = !role || role === "owner";
  const brand = useBrand();
  const profileName = demoMode ? "Aarav Shah" : isOperator ? "PGFlow operator" : brand.name;
  const profileRole = demoMode ? "Owner" : role ? ROLE_LABELS[role] ?? "" : "";
  const profileInitials = profileName.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "P";
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [lang, setLang] = useState<"EN" | "HI">("EN");
  const [helpOpen, setHelpOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  const unreadNotifications = demoMode && !notificationsRead ? demoNotifications.length : 0;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setMobileOpen(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [mobileOpen]);

  // ⌘K / Ctrl+K opens quick search. Ignored while typing so it cannot hijack form input.
  useEffect(() => {
    if (!demoMode) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && !isTypingTarget(event.target)) {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [demoMode]);

  useEffect(() => {
    if (!searchOpen && !helpOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setSearchOpen(false);
      setHelpOpen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [searchOpen, helpOpen]);

  // Dismiss the topbar popovers on an outside click or Escape.
  useEffect(() => {
    if (!notificationsOpen && !profileOpen) return;
    const closeAll = () => {
      setNotificationsOpen(false);
      setProfileOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (!actionsRef.current?.contains(event.target as Node)) closeAll();
    };
    const onEscape = (event: KeyboardEvent) => event.key === "Escape" && closeAll();
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [notificationsOpen, profileOpen]);

  function toggleLanguage() {
    setLang((current) => (current === "EN" ? "HI" : "EN"));
  }

  async function signOut() {
    if (signingOut) return;

    setSigningOut(true);
    setSignOutError(null);

    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST" });
      if (!response.ok) throw new Error("Sign-out failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setSignOutError("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  }

  const searchResults = demoSearchRecords.filter(
    (item) =>
      !searchQuery
      || item.title.toLowerCase().includes(searchQuery.toLowerCase())
      || item.type.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className={`app-shell ${compact ? "sidebar-compact" : ""}`}>
      <aside id="property-navigation" className={`sidebar ${mobileOpen ? "mobile-open" : ""}`} aria-hidden={isMobile && !mobileOpen} inert={isMobile && !mobileOpen ? true : undefined}>
        <div className="sidebar-head">
          <BrandMark compact={compact} />
          <button
            className="icon-button sidebar-collapse"
            type="button"
            onClick={() => setCompact((value) => !value)}
            aria-label={compact ? "Expand sidebar" : "Collapse sidebar"}
          >
            <PanelLeftClose size={18} />
          </button>
          <button
            className="icon-button mobile-close"
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X size={19} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Property navigation">
          <span className="nav-kicker">{isOperator ? "PGFlow" : "Property"}</span>
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                className={`nav-item ${isActive ? "active" : ""}`}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={18} strokeWidth={1.9} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-foot">
          {isOperator ? null : showSettings ? (
            <Link className={`nav-item ${pathname.startsWith("/settings") ? "active" : ""}`} href="/settings" aria-current={pathname.startsWith("/settings") ? "page" : undefined}>
              <Settings size={18} />
              <span>Settings</span>
            </Link>
          ) : (
            <Link className={`nav-item ${pathname.startsWith("/account") ? "active" : ""}`} href="/account/password">
              <Settings size={18} />
              <span>My password</span>
            </Link>
          )}
          {demoMode ? (
            <Link className="nav-item" href="/login">
              <LogOut size={18} />
              <span>Sign out</span>
            </Link>
          ) : (
            <button className="nav-item nav-item-button" type="button" onClick={signOut} disabled={signingOut}>
              <LogOut size={18} />
              <span>{signingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          )}
          {signOutError && <p className="sidebar-auth-error" role="alert">{signOutError}</p>}
          {!compact && <PoweredBy />}
        </div>
      </aside>
      {isMobile && mobileOpen && <button className="sidebar-overlay" type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} />}

      <div className="app-column">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
            aria-expanded={mobileOpen}
            aria-controls="property-navigation"
          >
            <Menu size={20} />
          </button>

          {demoMode && (
            <button className="search-box" type="button" onClick={() => setSearchOpen(true)}>
              <Search size={17} />
              <span className="search-box-placeholder">Search resident, room, UTR…</span>
              <kbd>⌘ K</kbd>
            </button>
          )}

          <div className="topbar-actions relative" ref={actionsRef}>
            {demoMode && (
              <button
                className="language-button"
                type="button"
                onClick={toggleLanguage}
                aria-label={`Change language, currently ${lang === "EN" ? "English" : "Hindi"}`}
              >
                <Languages size={17} />
                <span>{lang}</span>
                <ChevronDown size={14} />
              </button>
            )}

            <button
              className="icon-button help-button"
              type="button"
              onClick={() => setHelpOpen((prev) => !prev)}
              aria-label="Open help"
              aria-expanded={helpOpen}
            >
              <CircleHelp size={19} />
            </button>

            {demoMode && (
              <button
                className="icon-button notification-button"
                type="button"
                onClick={() => setNotificationsOpen((prev) => !prev)}
                aria-label="Notifications"
                aria-expanded={notificationsOpen}
              >
                <Bell size={19} />
                {unreadNotifications > 0 && (
                  <span aria-label={`${unreadNotifications} unread notifications`}>{unreadNotifications}</span>
                )}
              </button>
            )}

            <button
              className="profile-button"
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
            >
              <span className="avatar avatar-olive">{profileInitials}</span>
              <span className="profile-copy">
                <strong>{profileName}</strong>
                {profileRole && <small>{profileRole}</small>}
              </span>
              <ChevronDown size={15} />
            </button>

            {demoMode && notificationsOpen && (
              <div className="absolute right-12 top-14 z-50 w-80 rounded-2xl bg-white p-4 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-slate-800 dark:text-slate-100">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-sm">Notifications</span>
                  {unreadNotifications > 0 ? (
                    <button
                      type="button"
                      onClick={() => setNotificationsRead(true)}
                      className="text-xs text-emerald-600 font-semibold hover:underline"
                    >
                      Mark all as read
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">All caught up</span>
                  )}
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  {demoNotifications.map((notification) => (
                    <div
                      key={notification.title}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800"
                    >
                      <strong className="block font-semibold text-slate-900 dark:text-white">
                        {notification.title}
                      </strong>
                      <span className="text-slate-500">{notification.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profileOpen && (
              <div className="absolute right-0 top-14 z-50 w-56 rounded-2xl bg-white p-2 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                {!isOperator && (<>
                <Link
                  href={showSettings ? "/settings" : "/account/password"}
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Settings size={16} />
                  <span>{showSettings ? "Property settings" : "My password"}</span>
                </Link>
                <Link
                  href="/collections"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <CreditCard size={16} />
                  <span>Collections</span>
                </Link>
                </>)}
                {demoMode ? (
                  <Link
                    href="/login"
                    onClick={() => setProfileOpen(false)}
                    className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <LogOut size={16} />
                    <span>Sign out</span>
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={signingOut}
                    onClick={() => {
                      setProfileOpen(false);
                      signOut();
                    }}
                    className="w-full text-left flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    <LogOut size={16} />
                    <span>{signingOut ? "Signing out…" : "Sign out"}</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </header>

        {demoMode && searchOpen && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => event.target === event.currentTarget && setSearchOpen(false)}
          >
            <div
              className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
              role="dialog"
              aria-modal="true"
              aria-label="Quick search"
            >
              <div className="flex items-center gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                <Search className="text-slate-400" size={18} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Type to search residents, rooms, UTR…"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-slate-900 dark:text-white outline-none"
                />
                <button
                  type="button"
                  onClick={() => setSearchOpen(false)}
                  aria-label="Close search"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-3 max-h-72 overflow-y-auto space-y-1">
                {searchResults.length > 0 ? (
                  searchResults.map((item) => (
                    <Link
                      key={item.title}
                      href={item.href}
                      onClick={() => setSearchOpen(false)}
                      className="flex items-center justify-between rounded-xl p-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">{item.title}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {item.type}
                      </span>
                    </Link>
                  ))
                ) : (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No results matching &quot;{searchQuery}&quot;
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {helpOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
            role="presentation"
            onMouseDown={(event) => event.target === event.currentTarget && setHelpOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800"
              role="dialog"
              aria-modal="true"
              aria-labelledby="app-help-title"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <CircleHelp className="text-emerald-600" size={22} />
                  <h3 id="app-help-title" className="text-lg font-bold text-slate-900 dark:text-white">
                    PGFlow help &amp; support
                  </h3>
                </div>
                <button
                  type="button"
                  autoFocus
                  onClick={() => setHelpOpen(false)}
                  aria-label="Close help"
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 space-y-4 text-sm">
                <p className="text-slate-600 dark:text-slate-300">
                  PGFlow gives your PG a dedicated control room for rent collection, room management, and
                  WhatsApp messaging.
                </p>

                {process.env.NEXT_PUBLIC_PGFLOW_WHATSAPP_NUMBER && (
                  <a
                    href={`https://wa.me/${process.env.NEXT_PUBLIC_PGFLOW_WHATSAPP_NUMBER}?text=Hello%20PGFlow%20Support`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl bg-emerald-500/10 p-3 font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                  >
                    <MessageSquareText size={18} />
                    <span>Talk to PGFlow support on WhatsApp</span>
                  </a>
                )}

                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/40 text-xs space-y-1 text-slate-500">
                  <strong className="block text-slate-700 dark:text-slate-300">Quick tips</strong>
                  {demoMode && (
                    <div>• Press <strong>⌘ + K</strong> anywhere to search residents, rooms, or UTRs.</div>
                  )}
                  <div>• Configure your direct UPI destination in <strong>Settings</strong>.</div>
                  <div>• Review resident payment screenshots before issuing official receipts.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="app-main">{!demoMode && <PlanBanner />}{children}</main>
      </div>
    </div>
  );
}
