import {
  modelsShareContextBase,
  reconcileReasoningLevel,
  type AvailableModel,
  type ReasoningLevel,
} from "@bb/domain";
import type { ModelPickerOption } from "@/components/pickers/model-picker-option";
import type { PickerOption } from "@/components/pickers/OptionPicker";
import {
  reasoningLevelLabel,
  type ReasoningLabelSource,
} from "@/lib/reasoning-labels";

interface ResolveModelCatalogSelectionArgs {
  models: readonly AvailableModel[];
  selectedOnlyModels: readonly AvailableModel[];
  selectedModel: string;
  preferredReasoningLevel?: ReasoningLevel;
  provider: ReasoningLabelSource | undefined;
  catalogIsVerified: boolean;
  retainUnavailableSelection?: boolean;
  formatModelLabel: (displayName: string) => string;
}

interface ResolvedModelCatalogSelection {
  selectedModel: string;
  activeModel: AvailableModel | undefined;
  modelOptions: ModelPickerOption[];
  moreModelOptions: ModelPickerOption[];
  reasoningLevel: ReasoningLevel;
  reasoningOptions: PickerOption<ReasoningLevel>[];
  isUnavailableModelRecovery: boolean;
}

export function resolveModelReasoningLevel(
  model: AvailableModel | undefined,
  preferredReasoningLevel: ReasoningLevel,
): ReasoningLevel {
  const supportedReasoningLevels =
    model?.supportedReasoningEfforts.map((effort) => effort.reasoningEffort) ??
    [];
  return supportedReasoningLevels.length === 0
    ? preferredReasoningLevel
    : reconcileReasoningLevel(
        preferredReasoningLevel,
        supportedReasoningLevels,
      );
}

const UNAVAILABLE_MODEL_LABEL_SUFFIX = " (unavailable)";

function unavailableSelectedModel(model: string): AvailableModel {
  return {
    id: model,
    model,
    displayName: model,
    description: "",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: "medium",
    isDefault: false,
  };
}

function toModelPickerOption(
  model: AvailableModel,
  formatModelLabel: (displayName: string) => string,
  unavailable = false,
): ModelPickerOption {
  return {
    value: model.model,
    label: `${formatModelLabel(model.displayName || model.model)}${
      unavailable ? UNAVAILABLE_MODEL_LABEL_SUFFIX : ""
    }`,
    ...(model.routeProviderId
      ? { routeProviderId: model.routeProviderId }
      : {}),
  };
}

export function resolveModelCatalogSelection({
  models,
  selectedOnlyModels,
  selectedModel: rawSelectedModel,
  preferredReasoningLevel,
  provider,
  catalogIsVerified,
  retainUnavailableSelection = false,
  formatModelLabel,
}: ResolveModelCatalogSelectionArgs): ResolvedModelCatalogSelection {
  const fullCatalog = [...models, ...selectedOnlyModels];
  const selectedModelSelection = (() => {
    if (!rawSelectedModel) return rawSelectedModel;
    if (fullCatalog.some((model) => model.model === rawSelectedModel)) {
      return rawSelectedModel;
    }
    const prefixed = fullCatalog.filter((model) =>
      model.model.endsWith(`/${rawSelectedModel}`),
    );
    return prefixed.length === 1 ? prefixed[0].model : rawSelectedModel;
  })();

  const availableModels = [...models];
  if (
    selectedModelSelection &&
    !availableModels.some((model) => model.model === selectedModelSelection)
  ) {
    const selectedOnlyModel = selectedOnlyModels.find(
      (model) => model.model === selectedModelSelection,
    );
    if (selectedOnlyModel) {
      availableModels.unshift(selectedOnlyModel);
    }
  }

  let unavailableModel: string | null = null;
  let substitutedSelectedOnlyModel: string | null = null;
  if (
    selectedModelSelection &&
    !availableModels.some((model) => model.model === selectedModelSelection)
  ) {
    const equivalentIndex = availableModels.findIndex((model) =>
      modelsShareContextBase(model.model, selectedModelSelection),
    );
    const equivalentSelectedOnly = selectedOnlyModels.find((model) =>
      modelsShareContextBase(model.model, selectedModelSelection),
    );
    if (equivalentIndex >= 0) {
      availableModels[equivalentIndex] = {
        ...availableModels[equivalentIndex],
        model: selectedModelSelection,
      };
    } else if (equivalentSelectedOnly) {
      substitutedSelectedOnlyModel = equivalentSelectedOnly.model;
      availableModels.unshift({
        ...equivalentSelectedOnly,
        model: selectedModelSelection,
      });
    } else if (catalogIsVerified && retainUnavailableSelection) {
      unavailableModel = selectedModelSelection;
      availableModels.unshift(unavailableSelectedModel(selectedModelSelection));
    }
  }

  const selectedModel = (() => {
    if (!catalogIsVerified && selectedModelSelection) {
      return selectedModelSelection;
    }
    if (availableModels.length === 0) {
      return selectedModelSelection;
    }
    if (
      availableModels.some((model) => model.model === selectedModelSelection)
    ) {
      return selectedModelSelection;
    }
    return (
      availableModels.find((model) => model.isDefault)?.model ??
      availableModels[0].model
    );
  })();

  const activeModel =
    availableModels.find((model) => model.model === selectedModel) ??
    availableModels.find((model) => model.isDefault) ??
    availableModels[0];

  const reasoningOptions: PickerOption<ReasoningLevel>[] = [];
  const seenReasoningLevels = new Set<ReasoningLevel>();
  for (const effort of activeModel?.supportedReasoningEfforts ?? []) {
    if (seenReasoningLevels.has(effort.reasoningEffort)) continue;
    seenReasoningLevels.add(effort.reasoningEffort);
    reasoningOptions.push({
      value: effort.reasoningEffort,
      label: reasoningLevelLabel(effort.reasoningEffort, provider),
    });
  }

  const preferredLevel = preferredReasoningLevel ?? "medium";
  const reasoningLevel = resolveModelReasoningLevel(
    activeModel,
    preferredLevel,
  );

  return {
    selectedModel,
    activeModel,
    modelOptions: availableModels.map((model) =>
      toModelPickerOption(
        model,
        formatModelLabel,
        model.model === unavailableModel,
      ),
    ),
    moreModelOptions: selectedOnlyModels
      .filter(
        (model) =>
          model.model !== substitutedSelectedOnlyModel &&
          !availableModels.some((active) => active.model === model.model),
      )
      .map((model) => toModelPickerOption(model, formatModelLabel)),
    reasoningLevel,
    reasoningOptions,
    isUnavailableModelRecovery:
      catalogIsVerified &&
      rawSelectedModel.length > 0 &&
      selectedModel !== rawSelectedModel,
  };
}
