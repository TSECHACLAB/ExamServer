import { DadsUtilityLink } from "@/components/dads/DadsLink";

interface Props {
  href: string;
  label: string;
}

export default function FlowBackLink({ href, label }: Props) {
  return (
    <div className="mb-6">
      <DadsUtilityLink
        href={href}
        className="inline-flex min-h-11 items-center font-bold"
      >
        <span aria-hidden="true" className="mr-2">←</span>
        {label}
      </DadsUtilityLink>
    </div>
  );
}
