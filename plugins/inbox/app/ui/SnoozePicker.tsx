import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  SNOOZE_PRESET_IDS,
  SNOOZE_PRESET_LABELS,
  formatWakeAt,
  snoozePresetTime,
} from "../../shared/inbox-state.js";
import {
  closeSnoozePicker,
  snoozeThread,
  useInboxActionsBridge,
  useSnoozePickerThreadId,
} from "../model/inbox-actions.js";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function toDateTimeLocal(at: number): string {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseDateTimeLocal(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match === null) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  return new Date(year!, month! - 1, day!, hour!, minute!).getTime();
}

function SnoozePickerDialog({ threadId }: { threadId: string }) {
  const [openedAt] = useState(() => Date.now());
  const [value, setValue] = useState(() =>
    toDateTimeLocal(snoozePresetTime("tomorrow", openedAt)),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const submit = (until: number | null) => {
    if (until === null || until <= openedAt) {
      setError("Pick a time in the future.");
      return;
    }
    setPending(true);
    snoozeThread(threadId, until).then(
      () => closeSnoozePicker(),
      (cause: unknown) => {
        setPending(false);
        setError(cause instanceof Error ? cause.message : String(cause));
      },
    );
  };
  const now = openedAt;
  return (
    <DialogContent className="max-w-sm">
      <DialogHeader>
        <DialogTitle>Snooze thread</DialogTitle>
        <DialogDescription>
          The thread returns to the inbox at this time, or earlier if it needs
          you.
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          {SNOOZE_PRESET_IDS.map((preset) => {
            const until = snoozePresetTime(preset, now);
            return (
              <Button
                key={preset}
                variant="ghost"
                size="sm"
                disabled={pending}
                className="justify-between"
                onClick={() => submit(until)}
              >
                <span>{SNOOZE_PRESET_LABELS[preset]}</span>
                <span className="text-muted-foreground">{formatWakeAt(until)}</span>
              </Button>
            );
          })}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit(parseDateTimeLocal(value));
          }}
        >
          <Input
            type="datetime-local"
            aria-label="Snooze until"
            value={value}
            min={toDateTimeLocal(now)}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            className="h-8 flex-1"
          />
          <Button type="submit" size="sm" disabled={pending}>
            Snooze
          </Button>
        </form>
        {error === null ? null : (
          <p role="alert" className="text-xs text-destructive-text">
            {error}
          </p>
        )}
      </div>
    </DialogContent>
  );
}

export function SnoozePickerOverlay() {
  useInboxActionsBridge();
  const threadId = useSnoozePickerThreadId();
  return (
    <Dialog
      open={threadId !== null}
      onOpenChange={(open) => {
        if (!open) closeSnoozePicker();
      }}
    >
      {threadId === null ? null : (
        <SnoozePickerDialog key={threadId} threadId={threadId} />
      )}
    </Dialog>
  );
}
