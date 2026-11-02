import { useEffect, useSyncExternalStore } from "react";
import { useRpc, type PluginRpcClient } from "@get-bb/plugin-sdk/app";
import { inboxRpcContract } from "../../shared/contract.js";
import type { InboxThreadStates } from "../../shared/inbox-state.js";
import { useThreadStates } from "./use-inbox-data.js";

type InboxRpcClient = PluginRpcClient<typeof inboxRpcContract>;

let rpcClient: InboxRpcClient | null = null;
let latestStates: InboxThreadStates = {};
let pickerThreadId: string | null = null;
const pickerListeners = new Set<() => void>();

function client(): InboxRpcClient {
  if (rpcClient === null) throw new Error("The Inbox plugin is still loading.");
  return rpcClient;
}

export function useInboxActionsBridge(): void {
  const rpc = useRpc<typeof inboxRpcContract>();
  const states = useThreadStates();
  useEffect(() => {
    rpcClient = rpc;
    return () => {
      if (rpcClient === rpc) rpcClient = null;
    };
  }, [rpc]);
  useEffect(() => {
    latestStates = states;
  }, [states]);
}

export function isParked(threadId: string): boolean {
  return latestStates[threadId] !== undefined;
}

export async function settleThread(threadId: string): Promise<void> {
  await client().call("settle", { threadId });
}

export async function unsettleThread(threadId: string): Promise<void> {
  await client().call("unsettle", { threadId });
}

export async function snoozeThread(threadId: string, until: number): Promise<void> {
  await client().call("snooze", { threadId, until });
}

export function openSnoozePicker(threadId: string): void {
  pickerThreadId = threadId;
  for (const listener of pickerListeners) listener();
}

export function closeSnoozePicker(): void {
  pickerThreadId = null;
  for (const listener of pickerListeners) listener();
}

function subscribePicker(listener: () => void): () => void {
  pickerListeners.add(listener);
  return () => pickerListeners.delete(listener);
}

export function useSnoozePickerThreadId(): string | null {
  return useSyncExternalStore(
    subscribePicker,
    () => pickerThreadId,
    () => null,
  );
}
