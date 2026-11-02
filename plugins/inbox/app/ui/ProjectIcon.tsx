import { useState } from "react";
import {
  projectMonogram,
  projectMonogramColor,
} from "../../shared/project-icon.js";

export function ProjectMonogram({ name }: { name: string }) {
  const letters = projectMonogram(name);
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      data-inbox-project-monogram=""
      className="size-4 shrink-0 rounded-[25%]"
      style={{
        color: projectMonogramColor(name),
        background: "color-mix(in srgb, currentColor 24%, transparent)",
      }}
    >
      <text
        x="8"
        y="10.8"
        textAnchor="middle"
        fill="currentColor"
        fontSize="8.25"
        fontWeight="700"
        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
        {...(letters.length > 1
          ? { textLength: 12, lengthAdjust: "spacingAndGlyphs" }
          : {})}
      >
        {letters}
      </text>
    </svg>
  );
}

export function ProjectIcon({
  name,
  iconUrl,
}: {
  name: string;
  iconUrl: string | null;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (iconUrl === null || failedUrl === iconUrl) {
    return <ProjectMonogram name={name} />;
  }
  return (
    <img
      alt=""
      aria-hidden="true"
      src={iconUrl}
      draggable={false}
      className="size-4 shrink-0 rounded-[25%] object-cover"
      onError={() => setFailedUrl(iconUrl)}
    />
  );
}
