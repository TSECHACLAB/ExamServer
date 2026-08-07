import type { ReactNode } from "react";
import BugReportButton from "@/components/bug-report/BugReportButton";
import { DadsUtilityLink } from "@/components/dads/DadsLink";
import { Divider } from "@/vendor/dads-runtime/components/Divider";
import {
  Heading,
  HeadingShoulder,
  HeadingTitle,
} from "@/vendor/dads-runtime/components/Heading";
import { UtilityLink } from "@/vendor/dads-runtime/components/UtilityLink";
import ThemeSelector from "./ThemeSelector";

interface PracticePublicShellProps {
  children: ReactNode;
  description?: string;
  eyebrow?: string;
  title: string;
}

const PRACTICE_NAV = [
  { href: "/learn", label: "講義", hardNavigation: false, current: false },
  { href: "/", label: "演習", hardNavigation: false, current: true },
  { href: "/lab", label: "実践ラボ", hardNavigation: true, current: false },
] as const;

export default function PracticePublicShell({
  children,
  description,
  eyebrow,
  title,
}: PracticePublicShellProps) {
  return (
    <div className="practice-dads-surface min-h-[100dvh]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[110] focus:rounded-4 focus:bg-yellow-300 focus:px-4 focus:py-3 focus:text-blue-1000 focus:outline focus:outline-4 focus:outline-black"
      >
        本文へ移動
      </a>

      <header className="border-b border-solid-gray-420 bg-white">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-3 px-4 py-2 sm:px-6 lg:px-8">
          <DadsUtilityLink href="/" className="shrink-0 font-bold">
            ExamServer
          </DadsUtilityLink>
          <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
            <ThemeSelector variant="practice" modernLightLabel="標準ライト" />
            <BugReportButton variant="practice" />
            <DadsUtilityLink
              href="/TSHLadmin"
              className="hidden shrink-0 text-sm sm:inline-flex"
            >
              管理
            </DadsUtilityLink>
          </div>
        </div>

        <Divider color="gray-420" />
        <nav aria-label="主要ナビゲーション" className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <ul className="flex min-h-14 items-stretch gap-6 overflow-x-auto">
            {PRACTICE_NAV.map((item) => (
              <li key={item.href} className="flex shrink-0 items-stretch">
                {item.hardNavigation ? (
                  <UtilityLink
                    href={item.href}
                    className="inline-flex min-h-11 items-center font-bold"
                  >
                    {item.label}
                  </UtilityLink>
                ) : (
                  <DadsUtilityLink
                    href={item.href}
                    aria-current={item.current ? "page" : undefined}
                    className="inline-flex min-h-11 items-center border-b-4 border-transparent font-bold aria-[current=page]:border-key-900 aria-[current=page]:no-underline"
                  >
                    {item.label}
                  </DadsUtilityLink>
                )}
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <div className="border-b border-solid-gray-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <Heading size="36" className="max-w-4xl">
            {eyebrow ? <HeadingShoulder>{eyebrow}</HeadingShoulder> : null}
            <HeadingTitle level="h1">{title}</HeadingTitle>
          </Heading>
          {description ? (
            <p className="mt-4 max-w-[65ch] text-std-16N-170 text-solid-gray-700">
              {description}
            </p>
          ) : null}
        </div>
      </div>

      <main
        id="main-content"
        className="mx-auto min-h-[calc(100dvh-15rem)] max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8"
      >
        {children}
      </main>
    </div>
  );
}
