import * as vscode from 'vscode';
import { OpenRouterModel } from '../types/openRouter';

export class ModelSelector {
  /**
   * Show quick pick with available models
   */
  public static async selectModel(
    models: OpenRouterModel[],
    currentModelId?: string
  ): Promise<OpenRouterModel | undefined> {
    if (!models.length) {
      void vscode.window.showErrorMessage('No models available. Check your API key and connection.');
      return undefined;
    }

    // Group models by provider
    const modelsByProvider: Record<string, OpenRouterModel[]> = {};

    for (const model of models) {
      if (!modelsByProvider[model.provider]) {
        modelsByProvider[model.provider] = [];
      }
      modelsByProvider[model.provider].push(model);
    }

    // Create quick pick items with section headers
    const quickPickItems: (vscode.QuickPickItem & { model?: OpenRouterModel })[] = [];

    // Sort providers alphabetically
    const sortedProviders = Object.keys(modelsByProvider).sort();

    for (const provider of sortedProviders) {
      // Add separator
      quickPickItems.push({
        label: provider,
        kind: vscode.QuickPickItemKind.Separator
      });

      // Add models for this provider
      const providerModels = modelsByProvider[provider];
      providerModels.sort((a, b) => a.name.localeCompare(b.name));

      for (const model of providerModels) {
        // Format pricing if available
        let description = '';
        if (model.pricing) {
          const promptCost = model.pricing.prompt * 1000;
          const completionCost = model.pricing.completion * 1000;
          description = `$${promptCost.toFixed(2)}/1M prompt, $${completionCost.toFixed(2)}/1M completion`;
        }

        quickPickItems.push({
          label: model.name,
          description,
          detail: model.description || `Context: ${model.context_length} tokens`,
          picked: model.id === currentModelId,
          model: model
        });
      }
    }

    // Show the quick pick
    const selectedItem = await vscode.window.showQuickPick(quickPickItems, {
      title: 'Select AI Model',
      placeHolder: 'Choose a model to use with the AI Assistant',
      matchOnDescription: true,
      matchOnDetail: true
    });

    return selectedItem?.model;
  }
}