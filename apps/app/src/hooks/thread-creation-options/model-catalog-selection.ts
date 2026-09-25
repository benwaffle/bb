import {
  collectDeclaredSessionOptions,
  describeSessionOptionConflict,
  effectiveSessionOptionSelections,
  modelSessionOptionConflict,
  modelsShareContextBase,
  reconcileReasoningLevel,
  type AvailableModel,
  type ReasoningLevel,
  type SessionOptionSelections,
  type ThreadSessionOption,
} from "@bb/domain";
import type { ModelPickerOption } from "@/components/pickers/model-picker-option";
import type { PickerOption } from "@/components/pickers/OptionPicker";
import {
  reasoningLadderLabels,
  type ReasoningLabelSource,
} from "@/lib/reasoning-labels";

interface ResolveModelCatalogSelectionArgs {
  models: readonly AvailableModel[];
  selectedOnlyModels: readonly AvailableModel[];
  selectedModel: string;
  preferredReasoningLevel?: ReasoningLevel;
  sessionOptionSelections?: SessionOptionSelections;
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
  declaredSessionOptions: ThreadSessionOption[];
  sessionOptionSelections: SessionOptionSelections;
  isUnavailableModelRecovery: boolean;
  isSessionOptionModelSwitch: boolean;
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
        model?.defaultReasoningEffort,
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
  sessionOptionSelections: SessionOptionSelections,
  unavailable = false,
): ModelPickerOption {
  const conflict = modelSessionOptionConflict(model, sessionOptionSelections);
  return {
    value: model.model,
    label: `${formatModelLabel(model.displayName || model.model)}${
      unavailable ? UNAVAILABLE_MODEL_LABEL_SUFFIX : ""
    }`,
    ...(model.routeProviderId
      ? { routeProviderId: model.routeProviderId }
      : {}),
    ...(conflict === null
      ? {}
      : {
          disabled: true,
          disabledReason: describeSessionOptionConflict(conflict),
        }),
  };
}

export function resolveModelCatalogSelection({
  models,
  selectedOnlyModels,
  selectedModel: rawSelectedModel,
  preferredReasoningLevel,
  sessionOptionSelections: requestedSessionOptionSelections,
  provider,
  catalogIsVerified,
  retainUnavailableSelection = false,
  formatModelLabel,
}: ResolveModelCatalogSelectionArgs): ResolvedModelCatalogSelection {
  const fullCatalog = [...models, ...selectedOnlyModels];
  const declaredSessionOptions = collectDeclaredSessionOptions(fullCatalog);
  const sessionOptionSelections = effectiveSessionOptionSelections(
    declaredSessionOptions,
    requestedSessionOptionSelections ?? {},
  );
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

  const catalogSelectedModel = (() => {
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

  const selectedModel = (() => {
    const chosen = availableModels.find(
      (model) => model.model === catalogSelectedModel,
    );
    if (
      chosen === undefined ||
      modelSessionOptionConflict(chosen, sessionOptionSelections) === null
    ) {
      return catalogSelectedModel;
    }
    const compatible = availableModels.filter(
      (model) =>
        modelSessionOptionConflict(model, sessionOptionSelections) === null,
    );
    return (
      (compatible.find((model) => model.isDefault) ?? compatible[0])?.model ??
      catalogSelectedModel
    );
  })();

  const activeModel =
    availableModels.find((model) => model.model === selectedModel) ??
    availableModels.find((model) => model.isDefault) ??
    availableModels[0];

  const seenReasoningLevels = new Set<ReasoningLevel>();
  const reasoningEfforts = (
    activeModel?.supportedReasoningEfforts ?? []
  ).filter((effort) => {
    if (seenReasoningLevels.has(effort.reasoningEffort)) return false;
    seenReasoningLevels.add(effort.reasoningEffort);
    return true;
  });
  const reasoningLabels = reasoningLadderLabels(reasoningEfforts, provider);
  const reasoningOptions: PickerOption<ReasoningLevel>[] = reasoningEfforts.map(
    (effort, index) => ({
      value: effort.reasoningEffort,
      label: reasoningLabels[index] ?? effort.reasoningEffort,
    }),
  );

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
        sessionOptionSelections,
        model.model === unavailableModel,
      ),
    ),
    moreModelOptions: selectedOnlyModels
      .filter(
        (model) =>
          model.model !== substitutedSelectedOnlyModel &&
          !availableModels.some((active) => active.model === model.model),
      )
      .map((model) =>
        toModelPickerOption(model, formatModelLabel, sessionOptionSelections),
      ),
    reasoningLevel,
    reasoningOptions,
    declaredSessionOptions,
    sessionOptionSelections,
    isUnavailableModelRecovery:
      catalogIsVerified &&
      rawSelectedModel.length > 0 &&
      catalogSelectedModel !== rawSelectedModel,
    isSessionOptionModelSwitch: selectedModel !== catalogSelectedModel,
  };
}
