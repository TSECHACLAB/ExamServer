import NextLink from "next/link";
import type { ComponentProps } from "react";
import { Link } from "@/vendor/dads-runtime/components/Link";
import { UtilityLink } from "@/vendor/dads-runtime/components/UtilityLink";

type DadsNextLinkProps = ComponentProps<typeof NextLink>;

export function DadsLink({ children, className, ...props }: DadsNextLinkProps) {
  return (
    <Link asChild className={className}>
      <NextLink {...props}>{children}</NextLink>
    </Link>
  );
}

export function DadsUtilityLink({ children, className, ...props }: DadsNextLinkProps) {
  return (
    <UtilityLink asChild className={className}>
      <NextLink {...props}>{children}</NextLink>
    </UtilityLink>
  );
}
