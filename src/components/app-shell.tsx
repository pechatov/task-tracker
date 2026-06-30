"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  CalendarDays,
  FolderKanban,
  LogOut,
  Settings,
  SunMedium,
  type LucideIcon
} from "lucide-react";

type NavItem = {
  href: Route;
  label: string;
  icon: LucideIcon;
};

const navItems: NavItem[] = [
  { href: "/", label: "Today", icon: SunMedium },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (pathname === "/design-preview" || pathname === "/login") {
    return children;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-mark">TT</span>
          <span>Task Tracker</span>
        </Link>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                className={active ? "nav-link active" : "nav-link"}
                href={item.href}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <form action="/logout" method="post" className="logout-form">
          <button className="nav-link logout-button" type="submit">
            <LogOut size={18} />
            Выйти
          </button>
        </form>
      </aside>
      <div className="content-shell">{children}</div>
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              className={active ? "bottom-link active" : "bottom-link"}
              href={item.href}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <form action="/logout" method="post">
          <button className="bottom-link logout-button" type="submit">
            <LogOut size={18} />
            <span>Выход</span>
          </button>
        </form>
      </nav>
    </div>
  );
}
