import Link from "next/link";
import type { ReactNode } from "react";
import BugReportButton from "@/components/bug-report/BugReportButton";
import DocsWorkspace from "./DocsWorkspace";
import ThemeSelector from "./ThemeSelector";

type PublicSection = "learn" | "exam" | "admin";
type NavigationSection = Exclude<PublicSection, "admin"> | "lab";

interface PublicAppShellProps {
  activeSection: PublicSection;
  title: string;
  description?: string;
  eyebrow?: string;
  sidebar?: ReactNode;
  rightSidebar?: ReactNode;
  children: ReactNode;
  hideMobileTabs?: boolean;
}

const NAV_ITEMS: Array<{
  section: NavigationSection;
  href: string;
  label: string;
  description: string;
  hardNavigation?: boolean;
}> = [
  {
    section: "learn",
    href: "/learn",
    label: "講義",
    description: "基礎を読む",
  },
  {
    section: "exam",
    href: "/",
    label: "演習",
    description: "問題を解く",
  },
  {
    section: "lab",
    href: "/lab",
    label: "実践ラボ",
    description: "実機で確かめる",
    hardNavigation: true,
  },
];

export default function PublicAppShell({
  activeSection,
  title,
  description,
  eyebrow,
  sidebar,
  rightSidebar,
  children,
  hideMobileTabs = false,
}: PublicAppShellProps) {
  if (activeSection === "learn") {
    return (
      <DocsAppShell
        activeSection={activeSection}
        title={title}
        description={description}
        eyebrow={eyebrow}
        sidebar={sidebar}
        rightSidebar={rightSidebar}
        hideMobileTabs={hideMobileTabs}
      >
        {children}
      </DocsAppShell>
    );
  }

  return (
    <div className="exam-production-surface min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--surface)] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--link)] focus:shadow"
      >
        本文へ移動
      </a>

      <PublicHeader activeSection={activeSection} modernLightLabel="本番風" />

      <header className="border-b border-[var(--border)] bg-[var(--surface)]/92 px-5 py-6 backdrop-blur sm:px-8 lg:px-10">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-4xl">
            {eyebrow && (
              <p className="text-sm font-semibold text-[var(--link)]">
                {eyebrow}
              </p>
            )}
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
              {title}
            </h1>
            {description && (
              <p className="mt-3 max-w-[65ch] text-base leading-7 text-[var(--text-muted)]">
                {description}
              </p>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto min-h-[calc(100dvh-10.5rem)] max-w-7xl pb-24 lg:pb-0">
        <main id="main-content" className="px-5 py-6 sm:px-8 lg:px-10">
          <div className="mx-auto max-w-5xl">
            {children}
          </div>
        </main>
      </div>

      {!hideMobileTabs && <MobileBottomTabs activeSection={activeSection} />}
    </div>
  );
}

function DocsAppShell({
  activeSection,
  title,
  description,
  eyebrow,
  sidebar,
  rightSidebar,
  children,
  hideMobileTabs,
}: {
  activeSection: PublicSection;
  title: string;
  description?: string;
  eyebrow?: string;
  sidebar?: ReactNode;
  rightSidebar?: ReactNode;
  children: ReactNode;
  hideMobileTabs: boolean;
}) {
  return (
    <div className="min-h-[100dvh] bg-[var(--background)] text-[var(--foreground)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-[var(--surface)] focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-[var(--link)] focus:shadow"
      >
        本文へ移動
      </a>

      <div className="sticky top-0 z-40">
        <PublicHeader activeSection={activeSection} />
        {sidebar && (
          <details className="group border-t border-[var(--border)] lg:hidden">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between bg-[var(--surface)] px-4 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-muted)] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]">
              <span>講義ナビ</span>
              <DisclosureIcon />
            </summary>
            <div className="max-h-[62dvh] overflow-y-auto border-t border-[var(--border)] bg-[var(--surface)] px-4 py-4">
              {sidebar}
            </div>
          </details>
        )}
      </div>

      <DocsWorkspace sidebar={sidebar} rightSidebar={rightSidebar}>
        <main id="main-content" className="min-w-0 px-5 py-8 sm:px-8 lg:px-10">
          <div className="docs-heading-container mx-auto max-w-[76ch]">
            {eyebrow && (
              <p className="text-sm font-semibold text-[var(--link)]">
                {eyebrow}
              </p>
            )}
            <h1 className="docs-page-title mt-2 text-[2rem] leading-tight text-[var(--foreground)] sm:text-[2.35rem]">
              {title}
            </h1>
            {description && (
              <p className="docs-page-description mt-4 max-w-[62ch] text-base text-[var(--text-muted)]">
                {description}
              </p>
            )}
          </div>

          <div className="mt-8">{children}</div>
        </main>
      </DocsWorkspace>

      {!hideMobileTabs && <MobileBottomTabs activeSection={activeSection} />}
    </div>
  );
}

function DisclosureIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-4 w-4 shrink-0 text-[var(--text-muted)]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M4 8h8" />
      <path d="M8 4v8" className="transition-opacity group-open:opacity-0" />
    </svg>
  );
}

function PublicHeader({
  activeSection,
  modernLightLabel,
}: {
  activeSection: PublicSection;
  modernLightLabel?: string;
}) {
  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]/92 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[92rem] items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="rounded-md px-2 py-1.5 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--link)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          ExamServer
        </Link>

        <SectionTabs activeSection={activeSection} />

        <div className="ml-auto flex items-center gap-3">
          <ThemeSelector modernLightLabel={modernLightLabel} />
          <BugReportButton />
          <Link
            href="/TSHLadmin"
            className="hidden rounded-md px-2 py-1.5 text-xs font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] sm:block"
          >
            管理
          </Link>
        </div>
      </div>
    </header>
  );
}

function SectionTabs({ activeSection }: { activeSection: PublicSection }) {
  return (
    <nav
      aria-label="主要ナビゲーション"
      className="ml-4 hidden items-center gap-1 lg:flex"
    >
      {NAV_ITEMS.map((item) => (
        item.hardNavigation ? (
          <a
            key={item.section}
            href={item.href}
            className="inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            {item.label}
          </a>
        ) : (
          <Link
            key={item.section}
            href={item.href}
            aria-current={activeSection === item.section ? "page" : undefined}
            className={`inline-flex min-h-11 items-center rounded-md px-3 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
              activeSection === item.section
                ? "bg-[var(--primary-soft)] text-[var(--link)]"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {item.label}
          </Link>
        )
      ))}
    </nav>
  );
}

function MobileBottomTabs({
  activeSection,
}: {
  activeSection: PublicSection;
}) {
  return (
    <nav
      aria-label="主要ナビゲーション"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--surface)]/95 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
    >
      <div className="mx-auto grid max-w-xl grid-cols-3 gap-2">
        {NAV_ITEMS.map((item) => (
          item.hardNavigation ? (
            <a
              key={item.section}
              href={item.href}
              className="min-h-11 rounded-md border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-center text-[var(--text-muted)] transition-colors hover:bg-[var(--primary-soft)] hover:text-[var(--foreground)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span className="mt-0.5 block text-[11px] text-[var(--text-muted)]">
                {item.description}
              </span>
            </a>
          ) : (
            <Link
              key={item.section}
              href={item.href}
              aria-current={activeSection === item.section ? "page" : undefined}
              className={`min-h-11 rounded-md px-3 py-2 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
                activeSection === item.section
                  ? "bg-[var(--primary)] text-[var(--surface)]"
                  : "border border-[var(--border)] bg-[var(--surface-muted)] text-[var(--text-muted)] hover:bg-[var(--primary-soft)] hover:text-[var(--foreground)]"
              }`}
            >
              <span className="block text-sm font-semibold">{item.label}</span>
              <span
                className={`mt-0.5 block text-[11px] ${
                  activeSection === item.section
                    ? "text-[var(--surface)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {item.description}
              </span>
            </Link>
          )
        ))}
      </div>
    </nav>
  );
}
