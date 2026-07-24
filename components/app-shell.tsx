"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Bell,
  Building2,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FileBarChart,
  House,
  Languages,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  PanelLeftClose,
  Search,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { BrandMark, PoweredBy } from "./brand-mark";

const primaryNav = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/collections", label: "Collections", icon: CreditCard },
  { href: "/residents", label: "Residents", icon: Users },
  { href: "/rooms", label: "Rooms & beds", icon: Building2 },
  { href: "/operations", label: "Operations", icon: Wrench, badge: "9" },
  { href: "/reports", label: "Reports", icon: FileBarChart },
];

const demoNav = [
  { href: "/tenant", label: "Tenant app", icon: House },
  { href: "/operator", label: "Platform console", icon: ShieldCheck },
  { href: "/presentation", label: "Sales view", icon: MessageSquareText },
];

export function AppShell({ children, demoMode }: { children: ReactNode; demoMode: boolean }) {
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
  const [profileOpen, setProfileOpen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(3);

  // Apply stored theme on mount
  useEffect(() => {
    try {
      const storedPrimary = localStorage.getItem("pgflow_primary_color");
      const storedAccent = localStorage.getItem("pgflow_accent_color");
      if (storedPrimary) document.documentElement.style.setProperty("--brand", storedPrimary);
      if (storedAccent) document.documentElement.style.setProperty("--accent", storedAccent);
      const savedLang = localStorage.getItem("pgflow_lang") as "EN" | "HI" | null;
      if (savedLang) setLang(savedLang);
    } catch {
      // Storage access disabled or SSR
    }
  }, []);

  // Keyboard shortcut listener for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function toggleLanguage() {
    const next = lang === "EN" ? "HI" : "EN";
    setLang(next);
    try {
      localStorage.setItem("pgflow_lang", next);
    } catch {}
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

  // Quick search items
  const searchResults = [
    { title: "Aarav Shah (Resident, Room 101)", type: "Resident", href: "/residents" },
    { title: "Rohan Sharma (Resident, Room 204)", type: "Resident", href: "/residents" },
    { title: "Priya Patel (Resident, Room 302)", type: "Resident", href: "/residents" },
    { title: "Room 101 (Floor 1, 2 Beds)", type: "Room", href: "/rooms" },
    { title: "Room 204 (Floor 2, 3 Beds)", type: "Room", href: "/rooms" },
    { title: "RENT-INV-0726 (July Rent Invoice)", type: "Invoice", href: "/collections" },
    { title: "UTR-99201485 (Direct UPI Payment)", type: "Payment UTR", href: "/collections" },
  ].filter(
    (item) =>
      !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.type.toLowerCase().includes(searchQuery.toLowerCase())
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
          <span className="nav-kicker">Property</span>
          {primaryNav.map((item) => {
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
                {item.badge && <b>{item.badge}</b>}
              </Link>
            );
          })}

          {demoMode && (
            <>
              <span className="nav-kicker nav-kicker-spaced">Explore demo</span>
              {demoNav.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    aria-current={pathname.startsWith(item.href) ? "page" : undefined}
                  >
                    <Icon size={18} strokeWidth={1.9} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        <div className="sidebar-foot">
          <Link className={`nav-item ${pathname.startsWith("/settings") ? "active" : ""}`} href="/settings" aria-current={pathname.startsWith("/settings") ? "page" : undefined}>
            <Settings size={18} />
            <span>Settings</span>
          </Link>
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

          {/* Search Trigger Box */}
          <div className="search-box cursor-pointer" onClick={() => setSearchOpen(true)}>
            <Search size={17} />
            <input
              aria-label="Search property"
              placeholder="Search resident, room, UTR…"
              readOnly
              onClick={() => setSearchOpen(true)}
            />
            <kbd>⌘ K</kbd>
          </div>

          <div className="topbar-actions relative">
            {/* Language Switcher */}
            <button
              className="language-button"
              type="button"
              onClick={toggleLanguage}
              aria-label="Change language"
              title={`Switch language (Currently ${lang})`}
            >
              <Languages size={17} />
              <span>{lang}</span>
              <ChevronDown size={14} />
            </button>

            {/* Help Button */}
            <button
              className="icon-button help-button"
              type="button"
              onClick={() => setHelpOpen((prev) => !prev)}
              aria-label="Open help"
            >
              <CircleHelp size={19} />
            </button>

            {/* Notifications Bell */}
            <button
              className="icon-button notification-button"
              type="button"
              onClick={() => setNotificationsOpen((prev) => !prev)}
              aria-label="Notifications"
            >
              <Bell size={19} />
              {unreadNotifications > 0 && (
                <span aria-label={`${unreadNotifications} unread notifications`}>
                  {unreadNotifications}
                </span>
              )}
            </button>

            {/* Profile Dropdown Trigger */}
            <button
              className="profile-button"
              type="button"
              onClick={() => setProfileOpen((prev) => !prev)}
              aria-label="Open profile menu"
            >
              <span className="avatar avatar-olive">AS</span>
              <span className="profile-copy">
                <strong>Aarav Shah</strong>
                <small>Owner</small>
              </span>
              <ChevronDown size={15} />
            </button>

            {/* Notifications Popover */}
            {notificationsOpen && (
              <div className="absolute right-12 top-14 z-50 w-80 rounded-2xl bg-white p-4 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800 text-slate-800 dark:text-slate-100">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <span className="font-bold text-sm">Notifications</span>
                  {unreadNotifications > 0 ? (
                    <button
                      onClick={() => setUnreadNotifications(0)}
                      className="text-xs text-emerald-600 font-semibold hover:underline"
                    >
                      Mark all as read
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">All caught up!</span>
                  )}
                </div>
                <div className="mt-3 space-y-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <strong className="block font-semibold text-slate-900 dark:text-white">
                      2 Payment Proofs Pending
                    </strong>
                    <span className="text-slate-500">Awaiting owner review in Collections register.</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <strong className="block font-semibold text-slate-900 dark:text-white">
                      July Rent Generated
                    </strong>
                    <span className="text-slate-500">Invoices ready for 48 active residents.</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                    <strong className="block font-semibold text-slate-900 dark:text-white">
                      Room 204 Ticket Resolved
                    </strong>
                    <span className="text-slate-500">AC maintenance complete.</span>
                  </div>
                </div>
              </div>
            )}

            {/* Profile Dropdown Menu */}
            {profileOpen && (
              <div className="absolute right-0 top-14 z-50 w-56 rounded-2xl bg-white p-2 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
                <div className="p-3 border-b border-slate-100 dark:border-slate-800 mb-1">
                  <strong className="block text-sm text-slate-900 dark:text-white">Aarav Shah</strong>
                  <span className="text-xs text-slate-500">aarav.shah@pgflow.app</span>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Settings size={16} />
                  <span>Property Settings</span>
                </Link>
                <Link
                  href="/collections"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <CreditCard size={16} />
                  <span>Collections</span>
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    signOut();
                  }}
                  className="w-full text-left flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                >
                  <LogOut size={16} />
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </header>

        {/* ⌘K Search Command Modal */}
        {searchOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                <Search className="text-slate-400" size={18} />
                <input
                  type="text"
                  autoFocus
                  placeholder="Type to search residents, rooms, UTR..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-transparent text-sm font-medium text-slate-900 dark:text-white outline-none"
                />
                <button
                  onClick={() => setSearchOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-3 max-h-72 overflow-y-auto space-y-1">
                {searchResults.length > 0 ? (
                  searchResults.map((item, idx) => (
                    <Link
                      key={idx}
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

        {/* Help & Support Modal */}
        {helpOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <CircleHelp className="text-emerald-600" size={22} />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">PGFlow Help & Support</h3>
                </div>
                <button
                  onClick={() => setHelpOpen(false)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 space-y-4 text-sm">
                <p className="text-slate-600 dark:text-slate-300">
                  PGFlow gives your PG a dedicated operating control room for rent collection, room management, and WhatsApp messaging.
                </p>

                <div className="space-y-2">
                  <a
                    href={`https://wa.me/${process.env.NEXT_PUBLIC_PGFLOW_WHATSAPP_NUMBER || "919876543210"}?text=Hello%20PGFlow%20Support`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-xl bg-emerald-500/10 p-3 font-semibold text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20"
                  >
                    <MessageSquareText size={18} />
                    <span>Talk to PGFlow Support on WhatsApp</span>
                  </a>
                </div>

                <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/40 text-xs space-y-1 text-slate-500">
                  <strong className="block text-slate-700 dark:text-slate-300">Quick Tips:</strong>
                  <div>• Press <strong>⌘ + K</strong> anywhere to search residents, rooms, or UTRs.</div>
                  <div>• Configure direct UPI destination in <strong>Settings</strong>.</div>
                  <div>• Review tenant payment screenshots before issuing official receipts.</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
