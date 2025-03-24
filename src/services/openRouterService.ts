import axios from 'axios';
import * as vscode from 'vscode';
import {
  OpenRouterModel,
  OpenRouterApiResponse,
  OpenRouterModelsResponse,
  OpenRouterChatMessage,
  OpenRouterCompletionRequest,
  OpenRouterCompletionResponse,
  OpenRouterStreamResponse
} from '../types/openRouter';
import { ExtensionConfig } from '../types/config';

export class OpenRouterService {
  private client: any; // Use any type to avoid type compatibility issues
  private models: OpenRouterModel[] = [];
  private configService: any; // Will be properly typed later

  constructor(configService: any) {
    this.configService = configService;

    this.client = axios.create({
      baseURL: 'https://openrouter.ai/api/v1',
      timeout: 30000,
      allowAbsoluteUrls: true,
    });

    // Add request interceptor to add API key to all requests
    this.client.interceptors.request.use(async (config: any) => {
      try {
        const apiKey = await this.getValidatedApiKey();

        if (!config.headers) {
          config.headers = {};
        }

        // Ensure API key is properly formatted
        const formattedKey = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
        config.headers['Authorization'] = formattedKey;
        config.headers['HTTP-Referer'] = 'https://vscode-ai-assistant';
        config.headers['X-Title'] = 'VS Code AI Assistant';
        config.headers['Content-Type'] = 'application/json';

        return config;
      } catch (error: any) {
        console.error('API key validation error:', error.message);
        throw error;
      }
    });
  }

  /**
   * Fetch available models from OpenRouter
   */
  public async getModels(): Promise<OpenRouterModel[]> {
    try {
      if (this.models.length > 0) {
        return this.models; // Return cached models if available
      }

      const response = await this.client.get('/models');
      this.models = response.data.data;
      return this.models;
    } catch (error) {
      void vscode.window.showErrorMessage(`Failed to fetch models: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  /**
   * Get a specific model by ID
   */
  public async getModelById(modelId: string): Promise<OpenRouterModel | undefined> {
    const models = await this.getModels();
    return models.find(model => model.id === modelId);
  }

  /**
   * Send a completion request to OpenRouter
   */
  public async sendCompletion(
    modelId: string,
    messages: OpenRouterChatMessage[],
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<OpenRouterCompletionResponse | null> {
    try {
      // Verify model ID is in the correct format
      const normalizedModelId = this.normalizeModelId(modelId);
      console.log(`Using model: ${normalizedModelId}`);

      const request: OpenRouterCompletionRequest = {
        model: normalizedModelId,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens
      };

      console.log(`Sending request to OpenRouter API: ${JSON.stringify(request, null, 2)}`);
      const response = await this.client.post('/chat/completions', request);
      return response.data;
    } catch (error: any) {
      console.error('Completion request error:', error);

      // Extract more detailed error information
      let errorMessage = 'Unknown error';
      if (error.response) {
        // The request was made and the server responded with a status code outside of 2xx
        errorMessage = `Request failed with status code ${error.response.status}`;
        console.error('Error response data:', JSON.stringify(error.response.data, null, 2));
        console.error('Error response headers:', JSON.stringify(error.response.headers, null, 2));

        if (error.response.data && error.response.data.error) {
          const errorData = error.response.data.error;
          errorMessage += `: ${JSON.stringify(errorData)}`;

          // Handle specific known error cases
          if (errorData.message && errorData.message.includes("data policy")) {
            await this.handleDataPolicyError();
            return null;
          }
        }
      } else if (error.request) {
        // The request was made but no response was received
        errorMessage = 'No response received from server';
        console.error('Request details:', error.request);
      } else {
        // Something happened in setting up the request
        errorMessage = error.message || 'Error setting up request';
      }

      void vscode.window.showErrorMessage(`Completion request failed: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Handle data policy error from OpenRouter
   * This occurs when the user's privacy settings are too restrictive
   */
  private async handleDataPolicyError(): Promise<void> {
    const message = 'Your OpenRouter data privacy settings are preventing access to this model.';
    const openSettings = 'Open Privacy Settings';
    const response = await vscode.window.showErrorMessage(
      message,
      { modal: true },
      openSettings
    );

    if (response === openSettings) {
      void vscode.env.openExternal(vscode.Uri.parse('https://openrouter.ai/settings/privacy'));
    }
  }

  /**
   * Send a streaming completion request to OpenRouter
   */
  public async streamCompletion(
    modelId: string,
    messages: OpenRouterChatMessage[],
    options: { temperature?: number; maxTokens?: number } = {},
    onChunk: (chunk: OpenRouterStreamResponse) => void
  ): Promise<void> {
    try {
      // Verify model ID is in the correct format
      const normalizedModelId = this.normalizeModelId(modelId);

      const request: OpenRouterCompletionRequest = {
        model: normalizedModelId,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens,
        stream: true
      };

      const response = await this.client.post('/chat/completions', request, {
        responseType: 'stream'
      });

      const stream = response.data;

      stream.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.substring(6);
            if (data === '[DONE]') {
              return;
            }

            try {
              const parsed = JSON.parse(data) as OpenRouterStreamResponse;
              onChunk(parsed);
            } catch (err) {
              console.error('Failed to parse stream chunk', err);
            }
          }
        }
      });

      stream.on('error', (err: Error) => {
        void vscode.window.showErrorMessage(`Stream error: ${err.message}`);
      });

    } catch (error) {
      void vscode.window.showErrorMessage(`Stream request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Normalize model ID to ensure it's in the correct format for OpenRouter
   * Some models require specific formatting
   */
  private normalizeModelId(modelId: string): string {
    // If the modelId doesn't contain a slash, it's likely an incorrect format
    if (!modelId.includes('/')) {
      console.warn(`Model ID "${modelId}" may be in incorrect format, expected "provider/model"`);

      // For Google models, add the provider prefix if missing
      if (modelId.startsWith('gemini-')) {
        return `google/${modelId}`;
      }

      // For Anthropic models, add the provider prefix if missing
      if (modelId.startsWith('claude-')) {
        return `anthropic/${modelId}`;
      }

      // For OpenAI models, add the provider prefix if missing
      if (modelId.startsWith('gpt-')) {
        return `openai/${modelId}`;
      }
    }

    return modelId;
  }

  /**
   * Validate API connection and key
   * @returns An object with success status and error message if any
   */
  public async validateApiConnection(): Promise<{ success: boolean; message?: string }> {
    try {
      const apiKey = await this.configService.getApiKey();

      if (!apiKey) {
        return {
          success: false,
          message: 'OpenRouter API key is not set. Please set your API key first.'
        };
      }

      // Make a simple request to check connectivity
      const response = await this.client.get('/models');

      // If we get here, the connection is working
      return { success: true };
    } catch (error: any) {
      console.error('API validation error:', error);

      let message = 'Failed to connect to OpenRouter API';

      if (error.response) {
        // The request was made and the server responded with a status code
        if (error.response.status === 401 || error.response.status === 403) {
          message = 'Invalid or expired API key. Please update your OpenRouter API key.';
        } else if (error.response.status === 404) {
          message = 'API endpoint not found. The OpenRouter API may have changed or is temporarily unavailable.';
        } else {
          message = `API error (${error.response.status}): ${error.response.data?.error || 'Unknown error'}`;
        }
      } else if (error.request) {
        // The request was made but no response was received
        message = 'No response from OpenRouter API. Please check your internet connection.';
      } else {
        // Something happened in setting up the request
        message = `Error connecting to API: ${error.message}`;
      }

      return { success: false, message };
    }
  }

  /**
   * Check if the API key has the correct format
   * @param apiKey The API key to check
   * @returns True if the API key appears to be valid
   */
  private isValidApiKeyFormat(apiKey: string): boolean {
    // OpenRouter API keys should start with 'sk-or-v1-'
    const trimmedKey = apiKey.startsWith('Bearer ')
      ? apiKey.substring(7).trim()
      : apiKey.trim();

    return trimmedKey.startsWith('sk-or-v1-') && trimmedKey.length > 20;
  }

  /**
   * Get the API key and validate its format
   * @returns The validated API key or throws an error
   */
  private async getValidatedApiKey(): Promise<string> {
    const apiKey = await this.configService.getApiKey();

    if (!apiKey) {
      throw new Error('OpenRouter API key is not set');
    }

    if (!this.isValidApiKeyFormat(apiKey)) {
      throw new Error('Invalid OpenRouter API key format. It should start with "sk-or-v1-"');
    }

    return apiKey;
  }

  /**
   * Test the connection to OpenRouter and diagnose any issues
   * This is a more comprehensive test than validateApiConnection
   */
  public async testConnection(): Promise<void> {
    try {
      // First check if we have an API key
      const apiKey = await this.configService.getApiKey();
      if (!apiKey) {
        void vscode.window.showErrorMessage(
          'OpenRouter API key is not set. Please set your API key first.'
        );
        return;
      }

      // Check API key format
      if (!this.isValidApiKeyFormat(apiKey)) {
        void vscode.window.showErrorMessage(
          'Invalid OpenRouter API key format. Keys should start with "sk-or-v1-"'
        );
        return;
      }

      // Try to fetch models
      const response = await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Testing OpenRouter connection...',
          cancellable: false
        },
        async () => {
          try {
            return await this.client.get('/models');
          } catch (error: any) {
            return { error };
          }
        }
      );

      if (response.error) {
        this.handleConnectionError(response.error);
        return;
      }

      // Check if we have models
      const models = response.data?.data;
      if (!models || models.length === 0) {
        void vscode.window.showWarningMessage(
          'Connected to OpenRouter but no models were found. Check your account.'
        );
        return;
      }

      // Success!
      const freeModels = models.filter((model: any) => model.id.includes(':free')).length;
      void vscode.window.showInformationMessage(
        `Successfully connected to OpenRouter! Found ${models.length} models (${freeModels} free models).`
      );
    } catch (error: any) {
      void vscode.window.showErrorMessage(`Connection test failed: ${error.message}`);
    }
  }

  /**
   * Handle various connection errors with helpful messages
   */
  private handleConnectionError(error: any): void {
    if (error.response) {
      // The request was made and the server responded with a status code
      const status = error.response.status;
      const errorData = error.response.data?.error;

      if (status === 401 || status === 403) {
        void vscode.window.showErrorMessage(
          'Authentication failed. Your API key may be invalid or expired.'
        );
      } else if (status === 404) {
        if (errorData?.message?.includes('data policy')) {
          void this.handleDataPolicyError();
        } else {
          void vscode.window.showErrorMessage(
            'API endpoint not found. The OpenRouter API may have changed.'
          );
        }
      } else {
        void vscode.window.showErrorMessage(
          `API error (${status}): ${errorData?.message || 'Unknown error'}`
        );
      }
    } else if (error.request) {
      // The request was made but no response was received
      void vscode.window.showErrorMessage(
        'No response from OpenRouter API. Please check your internet connection.'
      );
    } else {
      // Something happened in setting up the request
      void vscode.window.showErrorMessage(`Error: ${error.message}`);
    }
  }
}