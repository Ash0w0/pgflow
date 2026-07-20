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
          <div className="search-box">
            <Search size={17} />
            <input aria-label="Search property" placeholder="Search resident, room, UTR…" />
            <kbd>⌘ K</kbd>
          </div>
          <div className="topbar-actions">
            <button className="language-button" type="button" aria-label="Change language">
              <Languages size={17} />
              <span>EN</span>
              <ChevronDown size={14} />
            </button>
            <button className="icon-button help-button" type="button" aria-label="Open help">
              <CircleHelp size={19} />
            </button>
            <button className="icon-button notification-button" type="button" aria-label="Notifications">
              <Bell size={19} />
              <span aria-label="3 unread notifications">3</span>
            </button>
            <button className="profile-button" type="button" aria-label="Open profile menu">
              <span className="avatar avatar-olive">AS</span>
              <span className="profile-copy">
                <strong>Aarav Shah</strong>
                <small>Owner</small>
              </span>
              <ChevronDown size={15} />
            </button>
          </div>
        </header>
        <main className="app-main">{children}</main>
      </div>
    </div>
  );
}
