import type { ImportThreadRequest } from "@bb/server-contract";
import type { LoggedPendingInteractionWorkSessionDeps } from "../../types.js";
import { ApiError } from "../../errors.js";
import { createThreadFromRequest } from "./thread-create.js";

type ThreadImportDeps = LoggedPendingInteractionWorkSessionDeps;

function requireForkCapableProvider(
  deps: Pick<ThreadImportDeps, "providerRegistry">,
  providerId: string,
): void {
  if (!deps.providerRegistry.supportsFork(providerId)) {
    throw new ApiError(
      400,
      "invalid_request",
      `Provider ${providerId} cannot continue an imported session because it does not support thread forks`,
    );
  }
}

export async function createThreadImportFromRequest(
  deps: ThreadImportDeps,
  request: ImportThreadRequest,
) {
  await deps.providerRegistry.whenRegistrationsSettled();
  requireForkCapableProvider(deps, request.providerId);
  return createThreadFromRequest(
    deps,
    {
      environment: request.environment,
      input: [],
      origin: request.origin,
      ...(request.originPluginId === undefined
        ? {}
        : { originPluginId: request.originPluginId }),
      ...(request.pluginMetadata === undefined
        ? {}
        : { pluginMetadata: request.pluginMetadata }),
      ...(request.permissionMode === undefined
        ? {}
        : { permissionMode: request.permissionMode }),
      ...(request.model === undefined ? {} : { model: request.model }),
      ...(request.reasoningLevel === undefined
        ? {}
        : { reasoningLevel: request.reasoningLevel }),
      projectId: request.projectId,
      providerId: request.providerId,
      startedOnBehalfOf: null,
      ...(request.title === undefined ? {} : { title: request.title }),
    },
    {
      importedHistory: {
        sourceProviderThreadId: request.sourceProviderThreadId,
        turns: request.turns,
      },
    },
  );
}
