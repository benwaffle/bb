import { useMemo } from "react";
import { cn } from "@bb/shared-ui/lib/utils";
import { highlightMarkdownCode } from "./markdown-code-highlight.js";
import "./markdown-code-highlight.css";

interface ShellCommandHighlightProps {
  command: string;
  className?: string;
  flowingLines?: boolean;
  id?: string;
  title?: string;
}

export function ShellCommandHighlight({
  command,
  className,
  flowingLines = false,
  id,
  title,
}: ShellCommandHighlightProps) {
  const html = useMemo(
    () => highlightMarkdownCode({ code: command, language: "shell" }),
    [command],
  );
  return (
    <span
      id={id}
      title={title}
      className={cn(
        "bb-code-highlight",
        flowingLines && "bb-code-highlight--flowing-lines",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
