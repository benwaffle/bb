import {
  forwardRef,
  useImperativeHandle,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import { vi } from "vitest";

export const panelGroupState = {
  getLayout: vi.fn((): number[] => [60, 40]),
  setLayout: vi.fn((_layout: number[]) => {}),
};

export const PanelGroup = forwardRef<
  typeof panelGroupState,
  HTMLAttributes<HTMLDivElement>
>(({ children, ...props }, ref) => {
  useImperativeHandle(ref, () => panelGroupState, []);
  return (
    <div {...props} data-testid="panel-group">
      {children}
    </div>
  );
});
PanelGroup.displayName = "MockPanelGroup";

export function Panel({
  children,
  className,
  id,
  style,
}: {
  children?: ReactNode;
  className?: string;
  id?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      data-testid="panel"
      data-panel=""
      data-panel-id={id}
      className={className}
      style={style}
    >
      {children}
    </div>
  );
}

export function PanelResizeHandle({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div data-testid="panel-resize-handle" className={className}>
      {children}
    </div>
  );
}
