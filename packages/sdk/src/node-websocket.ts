import { WebSocket as NodeWsWebSocket, type RawData } from "ws";
import {
  createRealtimeSocketAdapter,
  wrapStandardWebsocket,
} from "./realtime-client.js";
import type { BbRealtimeSocket, BbRealtimeSocketFactory } from "./transport.js";

function decodeWsMessageData(data: RawData): string {
  if (typeof data === "string") {
    return data;
  }
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  if (Buffer.isBuffer(data)) {
    return data.toString("utf8");
  }
  return Buffer.from(new Uint8Array(data)).toString("utf8");
}

interface NodeWebsocketFactoryOptions {
  headers?: Record<string, string>;
}

export function wrapNodeWsWebsocket(
  url: string,
  options: NodeWebsocketFactoryOptions = {},
): BbRealtimeSocket {
  const socket = new NodeWsWebSocket(url, { headers: options.headers ?? {} });
  const adapter = createRealtimeSocketAdapter(socket);
  socket.on("open", () => adapter.onopen?.());
  socket.on("message", (data) =>
    adapter.onmessage?.({ data: decodeWsMessageData(data) }),
  );
  socket.on("close", () => adapter.onclose?.());
  socket.on("error", () => adapter.onerror?.());
  return adapter;
}

// The global WebSocket cannot attach request headers, so any factory that
// needs them always goes through the `ws` implementation.
export function createNodeWebsocketFactory(
  options: NodeWebsocketFactoryOptions = {},
): BbRealtimeSocketFactory {
  return (url) => {
    if (options.headers === undefined && typeof WebSocket !== "undefined") {
      return wrapStandardWebsocket(new WebSocket(url));
    }
    return wrapNodeWsWebsocket(url, options);
  };
}
