import * as vscode from 'vscode';
import { ExtensionConfig, SecureStorage } from '../types/config';

export class ConfigService {
  private extensionContext: vscode.ExtensionContext;
  private readonly configSection = 'aiCodingAssistant';

  constructor(context: vscode.ExtensionContext) {
    this.extensionContext = context;
  }

  /**
   * Get the full configuration
   */
  public getConfig(): ExtensionConfig {
    const config = vscode.workspace.getConfiguration(this.configSection);

    return {
      apiKey: config.get<string>('apiKey') || '',
      defaultModel: config.get<string>('defaultModel') || 'anthropic/claude-3-opus',
      contextWindowSize: config.get<number>('contextWindowSize') || 100000,
    };
  }

  /**
   * Update a configuration value
   */
  public async updateConfig<K extends keyof ExtensionConfig>(
    key: K,
    value: ExtensionConfig[K]
  ): Promise<void> {
    await vscode.workspace.getConfiguration(this.configSection).update(
      key,
      value,
      vscode.ConfigurationTarget.Global
    );
  }

  /**
   * Securely store the API key
   */
  public async setApiKey(apiKey: string): Promise<void> {
    if (!apiKey) {
      return;
    }

    try {
      await this.extensionContext.secrets.store('openrouter-api-key', apiKey);
      await this.updateConfig('apiKey', 'stored-in-secret-storage');
    } catch (err) {
      // If secure storage fails, fall back to settings (less secure)
      await this.updateConfig('apiKey', apiKey);
      void vscode.window.showWarningMessage(
        'Could not store API key securely. The key has been stored in settings instead (less secure).'
      );
    }
  }

  /**
   * Get the API key, checking secure storage first then settings
   */
  public async getApiKey(): Promise<string> {
    try {
      // Try to get from secret storage first
      const secretKey = await this.extensionContext.secrets.get('openrouter-api-key');
      if (secretKey) {
        return secretKey;
      }

      // Fall back to checking settings
      const config = this.getConfig();
      if (config.apiKey && config.apiKey !== 'stored-in-secret-storage') {
        return config.apiKey;
      }

      return '';
    } catch (err) {
      return '';
    }
  }

  /**
   * Prompt the user to enter their API key
   */
  public async promptForApiKey(): Promise<string | undefined> {
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your OpenRouter API key',
      password: true,
      ignoreFocusOut: true,
    });

    if (apiKey) {
      await this.setApiKey(apiKey);
      return apiKey;
    }

    return undefined;
  }
}