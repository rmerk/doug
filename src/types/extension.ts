import * as vscode from 'vscode';
import { OpenRouterModel, OpenRouterChatMessage } from './openRouter';

export interface ExtensionState {
  availableModels: OpenRouterModel[];
  selectedModel: OpenRouterModel | null;
  chat: {
    messages: OpenRouterChatMessage[];
    isLoading: boolean;
  };
  context: ContextItem[];
}

export interface ContextItem {
  id: string;
  source: ContextSource;
  content: string;
  relevance: number; // 0-100 score indicating relevance
  timestamp: number; // When this context was added
  path?: string;     // Path or identifier for the source
}

export enum ContextSource {
  File = 'file',
  Selection = 'selection',
  Manual = 'manual',
  Conversation = 'conversation'
}

export interface WebviewMessage {
  command: string;
  payload?: any;
}

export interface ServiceContainer {
  openRouter: any; // Will be properly typed once service is implemented
  context: any;
  file: any;
  config: any;
}