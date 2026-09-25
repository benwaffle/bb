import type { ProviderModelCatalogScope } from "./provider-types.js";

export function providerModelCatalogDependsOnWorkspace(
  scope: ProviderModelCatalogScope | undefined,
): boolean {
  return scope !== "host";
}

const EXTENDED_CONTEXT_MODEL_SUFFIX = "[1m]";

export function modelContextBaseId(model: string): string {
  return model.endsWith(EXTENDED_CONTEXT_MODEL_SUFFIX)
    ? model.slice(0, -EXTENDED_CONTEXT_MODEL_SUFFIX.length)
    : model;
}

export function modelsShareContextBase(left: string, right: string): boolean {
  return modelContextBaseId(left) === modelContextBaseId(right);
}
