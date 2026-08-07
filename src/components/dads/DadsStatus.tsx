import type { ReactNode } from "react";
import {
  NotificationBanner,
  NotificationBannerBody,
} from "@/vendor/dads-runtime/components/NotificationBanner";
import {
  ProgressIndicator,
  ProgressIndicatorSpinner,
} from "@/vendor/dads-runtime/components/ProgressIndicator";

type DadsStatusBannerProps = {
  children?: ReactNode;
  live?: "assertive" | "polite";
  title: string;
  type: "error" | "info1" | "info2" | "success" | "warning";
};

export function DadsStatusBanner({ children, live, title, type }: DadsStatusBannerProps) {
  return (
    <div
      aria-live={live}
      role={live === "assertive" ? "alert" : live ? "status" : undefined}
    >
      <NotificationBanner
        bannerStyle="standard"
        className="dads-adapter-notification"
        headingLevel="h2"
        title={title}
        type={type}
      >
        {children ? <NotificationBannerBody>{children}</NotificationBannerBody> : null}
      </NotificationBanner>
    </div>
  );
}

export function DadsLoading({ label = "読み込んでいます" }: { label?: string }) {
  return (
    <ProgressIndicator
      aria-label={label}
      className="min-h-48"
      type="stacked"
    >
      <ProgressIndicatorSpinner />
      <span>{label}</span>
    </ProgressIndicator>
  );
}
