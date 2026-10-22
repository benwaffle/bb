import type { CSSProperties, ReactNode } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { cn } from "@/lib/utils";

export function PluginLabelLink({
  href,
  className,
  style,
  children,
  ...dataAttributes
}: {
  href: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
} & { [attribute: `data-${string}`]: string | undefined }) {
  const navigate = useBbNavigate();
  return (
    <a
      {...dataAttributes}
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "pointer-events-auto relative z-[31] cursor-pointer hover:underline focus-visible:underline focus-visible:outline-none",
        className,
      )}
      style={style}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        navigate.openUrl(href);
      }}
    >
      {children}
    </a>
  );
}
