import NextLink, { type LinkProps as NextLinkProps } from "next/link";
import { forwardRef, type ReactNode } from "react";
import {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "@/vendor/dads-runtime/components/Button";

export const DadsButton = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "solid-fill", ...props }, ref) => (
    <Button
      ref={ref}
      className={`dads-adapter-button ${className ?? ""}`}
      data-dads-variant={variant}
      variant={variant}
      {...props}
    />
  ),
);

DadsButton.displayName = "DadsButton";

type DadsButtonLinkProps = NextLinkProps & {
  children: ReactNode;
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function DadsButtonLink({
  children,
  className,
  size = "md",
  variant = "solid-fill",
  ...props
}: DadsButtonLinkProps) {
  return (
    <Button
      asChild
      className={`dads-adapter-button ${className ?? ""}`}
      data-dads-variant={variant}
      size={size}
      variant={variant}
    >
      <NextLink {...props}>{children}</NextLink>
    </Button>
  );
}
