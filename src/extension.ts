import * as vscode from 'vscode';
import * as path from 'path';
import { OpenRouterService } from './services/openRouterService';
import { ConfigService } from './services/configService';
import { ContextService } from './services/contextService';
import { FileService } from './services/fileService';
import { ChatWebviewPanel } from './ui/webviewPanel';
import { ModelSelector } from './ui/modelSelector';
import { StatusBarManager } from './ui/statusBarItem';
import { OpenRouterModel, OpenRouterChatMessage } from './types/openRouter';
import { ServiceContainer, ExtensionState } from './types/extension';

// Extension state
let state: ExtensionState = {
  availableModels: [],
  selectedModel: null,
  chat: {
    messages: [],
    isLoading: false
  },
  context: []
};

// Services container
let services: ServiceContainer;

// UI components
let statusBar: StatusBarManager;

// Extension context
let extensionPath: string;

export async function activate(context: vscode.ExtensionContext) {
  console.log('AI Coding Assistant extension is now active');

  // Store extension path
  extensionPath = context.extensionPath;

  // Initialize services
  const configService = new ConfigService(context);
  const openRouterService = new OpenRouterService(configService);
  const contextService = new ContextService(context, configService);
  const fileService = new FileService();

  // Create services container
  services = {
    openRouter: openRouterService,
    context: contextService,
    file: fileService,
    config: configService
  };

  // Initialize UI components - show status bar immediately
  statusBar = new StatusBarManager();
  statusBar.updateStatus('Click to Setup');

  // Register commands
  const openChatPanelCommand = vscode.commands.registerCommand(
    'doug.openChatPanel',
    async () => {
      try {
        await openChatPanel();
      } catch (error) {
        console.error('Error opening chat panel:', error);
        void vscode.window.showErrorMessage(`Failed to open chat panel: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  );

  const selectModelCommand = vscode.commands.registerCommand(
    'doug.selectModel',
    async () => {
      try {
        await selectModel();
      } catch (error) {
        console.error('Error selecting model:', error);
        void vscode.window.showErrorMessage(`Failed to select model: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  );

  const addContextFromFileCommand = vscode.commands.registerCommand(
    'doug.addContextFromFile',
    async () => {
      try {
        await addContextFromFile();
      } catch (error) {
        console.error('Error adding context from file:', error);
        void vscode.window.showErrorMessage(`Failed to add context: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  );

  const testConnectionCommand = vscode.commands.registerCommand(
    'doug.testConnection',
    async () => {
      try {
        await services.openRouter.testConnection();
      } catch (error) {
        console.error('Error testing connection:', error);
        void vscode.window.showErrorMessage(`Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  );

  // Add disposables to context
  context.subscriptions.push(
    openChatPanelCommand,
    selectModelCommand,
    addContextFromFileCommand,
    testConnectionCommand,
    statusBar
  );

  // Initialize models on startup
  try {
    // Try to get API key
    const apiKey = await configService.getApiKey();

    if (!apiKey) {
      // Update status bar to indicate setup is needed
      statusBar.updateStatus('Setup Required');
      // Don't prompt automatically - let user click status bar
      return;
    }

    // Validate API connection
    const apiValidation = await openRouterService.validateApiConnection();
    if (!apiValidation.success) {
      statusBar.updateStatus('API Error');
      console.error('API validation failed:', apiValidation.message);
      return;
    }

    // Load models
    await loadModels();

    // Try to load default model
    const config = configService.getConfig();
    if (config.defaultModel) {
      const defaultModel = await openRouterService.getModelById(config.defaultModel);
      if (defaultModel) {
        state.selectedModel = defaultModel;
        statusBar.updateModel(defaultModel);
      }
    }
  } catch (error) {
    console.error('Failed to initialize extension:', error);
    statusBar.updateStatus('Setup Failed');
  }
}

/**
 * Load available models
 */
async function loadModels(): Promise<void> {
  try {
    state.availableModels = await services.openRouter.getModels();
  } catch (error) {
    void vscode.window.showErrorMessage('Failed to load models from OpenRouter');
  }
}

/**
 * Open the chat panel
 */
async function openChatPanel(): Promise<void> {
  // Check if we have an API key first
  const apiKey = await services.config.getApiKey();
  if (!apiKey) {
    const providedKey = await services.config.promptForApiKey();
    if (!providedKey) {
      // User cancelled API key input
      return;
    }

    // Validate the newly provided API key
    const validation = await services.openRouter.validateApiConnection();
    if (!validation.success) {
      void vscode.window.showErrorMessage(`API connection failed: ${validation.message}`);
      return;
    }
  }

  // Check if API connection is valid
  const validation = await services.openRouter.validateApiConnection();
  if (!validation.success) {
    const result = await vscode.window.showErrorMessage(
      `OpenRouter API error: ${validation.message}`,
      'Update API Key',
      'Cancel'
    );

    if (result === 'Update API Key') {
      const newKey = await services.config.promptForApiKey();
      if (newKey) {
        // Try again with new key
        return openChatPanel();
      }
    }
    return;
  }

  // Check if we have models loaded
  if (state.availableModels.length === 0) {
    await loadModels();
    if (state.availableModels.length === 0) {
      void vscode.window.showErrorMessage('Could not load models from OpenRouter. Please check your API key and try again.');
      return;
    }
  }

  // Check if we have a selected model
  if (!state.selectedModel && state.availableModels.length > 0) {
    await selectModel();
    if (!state.selectedModel) {
      // User cancelled model selection
      return;
    }
  }

  // Show the chat panel
  ChatWebviewPanel.createOrShow(
    vscode.Uri.file(extensionPath),
    state.selectedModel,
    state.chat.messages,
    handleSendMessage,
    selectModel
  );
}

/**
 * Handle sending a message
 */
async function handleSendMessage(message: string): Promise<void> {
  if (!state.selectedModel) {
    void vscode.window.showErrorMessage('Please select a model first');
    return;
  }

  try {
    // Add user message to chat
    const userMessage: OpenRouterChatMessage = {
      role: 'user',
      content: message
    };

    state.chat.messages.push(userMessage);

    // Update UI
    if (ChatWebviewPanel.currentPanel) {
      ChatWebviewPanel.currentPanel.updateMessages(state.chat.messages);
      ChatWebviewPanel.currentPanel.updateLoadingState(true);
    }

    statusBar.showLoading();
    state.chat.isLoading = true;

    // Prepare messages with context
    const contextMessages = services.context.generateContextMessages();
    const allMessages = [...contextMessages, ...state.chat.messages];

    // Send the request
    const response = await services.openRouter.sendCompletion(
      state.selectedModel.id,
      allMessages
    );

    if (response && response.choices.length > 0) {
      // Add assistant response to chat
      const assistantMessage: OpenRouterChatMessage = {
        role: 'assistant',
        content: response.choices[0].message.content
      };

      state.chat.messages.push(assistantMessage);

      // Add conversation to context
      services.context.addContextFromMessages(
        state.chat.messages.slice(-2), // Just the last user + assistant exchange
        85
      );
    } else {
      void vscode.window.showErrorMessage('Failed to get a response from the AI model');

      // Show troubleshooting panel
      if (ChatWebviewPanel.currentPanel) {
        ChatWebviewPanel.currentPanel.showTroubleshooting(
          'Failed to get a response. This could be due to API key, model access, or privacy settings issues.'
        );
      }
    }
  } catch (error: any) {
    void vscode.window.showErrorMessage(`Error: ${error.message}`);

    // Show troubleshooting panel with error message
    if (ChatWebviewPanel.currentPanel) {
      ChatWebviewPanel.currentPanel.showTroubleshooting(
        `Error: ${error.message}`
      );
    }
  } finally {
    // Update UI
    state.chat.isLoading = false;

    if (ChatWebviewPanel.currentPanel) {
      ChatWebviewPanel.currentPanel.updateMessages(state.chat.messages);
      ChatWebviewPanel.currentPanel.updateLoadingState(false);
    }

    if (state.selectedModel) {
      statusBar.updateModel(state.selectedModel);
    } else {
      statusBar.updateStatus();
    }
  }
}

/**
 * Select a model
 */
async function selectModel(): Promise<void> {
  try {
    // Show model selection UI
    const selectedModel = await ModelSelector.selectModel(
      state.availableModels,
      state.selectedModel?.id
    );

    if (selectedModel) {
      state.selectedModel = selectedModel;
      statusBar.updateModel(selectedModel);

      // Update chat panel if open
      if (ChatWebviewPanel.currentPanel) {
        ChatWebviewPanel.currentPanel.updateModel(selectedModel);
      }

      // Save as default
      await services.config.updateConfig('defaultModel', selectedModel.id);
    }
  } catch (error: any) {
    void vscode.window.showErrorMessage(`Error selecting model: ${error.message}`);
  }
}

/**
 * Add current file to context
 */
async function addContextFromFile(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    void vscode.window.showErrorMessage('No file is currently open');
    return;
  }

  try {
    const contextItem = await services.context.addContextFromFile(editor.document.uri);
    void vscode.window.showInformationMessage(`Added ${editor.document.fileName} to context`);
  } catch (error: any) {
    void vscode.window.showErrorMessage(`Error adding file to context: ${error.message}`);
  }
}

export function deactivate() {
  // Clean up resources
  if (statusBar) {
    statusBar.dispose();
  }
}