import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { ConfigService } from './configService';
import { ContextItem, ContextSource, ExtensionState } from '../types/extension';
import { OpenRouterChatMessage } from '../types/openRouter';

export class ContextService {
  private context: ContextItem[] = [];
  private extensionContext: vscode.ExtensionContext;
  private configService: ConfigService;

  constructor(extensionContext: vscode.ExtensionContext, configService: ConfigService) {
    this.extensionContext = extensionContext;
    this.configService = configService;
    this.loadContext();
  }

  /**
   * Get all context items
   */
  public getContext(): ContextItem[] {
    return [...this.context];
  }

  /**
   * Add context from a file
   */
  public async addContextFromFile(uri: vscode.Uri, relevance = 80): Promise<ContextItem> {
    const document = await vscode.workspace.openTextDocument(uri);
    const content = document.getText();

    return this.addContext({
      source: ContextSource.File,
      content,
      relevance,
      path: uri.fsPath
    });
  }

  /**
   * Add context from current selection
   */
  public addContextFromSelection(editor: vscode.TextEditor, relevance = 90): ContextItem | null {
    if (!editor.selection || editor.selection.isEmpty) {
      return null;
    }

    const content = editor.document.getText(editor.selection);

    return this.addContext({
      source: ContextSource.Selection,
      content,
      relevance,
      path: editor.document.uri.fsPath
    });
  }

  /**
   * Add context from chat messages
   */
  public addContextFromMessages(messages: OpenRouterChatMessage[], relevance = 85): ContextItem {
    const content = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');

    return this.addContext({
      source: ContextSource.Conversation,
      content,
      relevance,
      path: 'chat-history'
    });
  }

  /**
   * Add context manually
   */
  public addManualContext(content: string, relevance = 75): ContextItem {
    return this.addContext({
      source: ContextSource.Manual,
      content,
      relevance,
      path: 'manual-input'
    });
  }

  /**
   * Generic method to add context
   */
  private addContext(
    options: {
      source: ContextSource;
      content: string;
      relevance: number;
      path?: string;
    }
  ): ContextItem {
    const { source, content, relevance, path } = options;

    const id = crypto.randomUUID();
    const timestamp = Date.now();

    const newItem: ContextItem = {
      id,
      source,
      content,
      relevance,
      timestamp,
      path
    };

    this.context.push(newItem);
    this.pruneContextIfNeeded();
    this.saveContext();

    return newItem;
  }

  /**
   * Remove a context item by ID
   */
  public removeContext(id: string): boolean {
    const initialLength = this.context.length;
    this.context = this.context.filter(item => item.id !== id);

    if (this.context.length !== initialLength) {
      this.saveContext();
      return true;
    }

    return false;
  }

  /**
   * Clear all context
   */
  public clearContext(): void {
    this.context = [];
    this.saveContext();
  }

  /**
   * Generate chat messages from context for API requests
   */
  public generateContextMessages(): OpenRouterChatMessage[] {
    // Sort by relevance (highest first)
    const sortedContext = [...this.context].sort((a, b) => b.relevance - a.relevance);

    // Convert to system message
    if (sortedContext.length === 0) {
      return [];
    }

    // Create a detailed system message with the context
    const contextMessage: OpenRouterChatMessage = {
      role: 'system',
      content: `You have the following context information:\n\n${
        sortedContext.map(item => {
          const source = item.path ? `${item.source} (${item.path})` : item.source;
          return `--- BEGIN ${source} ---\n${item.content}\n--- END ${source} ---\n`;
        }).join('\n')
      }`
    };

    return [contextMessage];
  }

  /**
   * Save context to extension storage
   */
  private saveContext(): void {
    this.extensionContext.globalState.update('context', this.context);
  }

  /**
   * Load context from extension storage
   */
  private loadContext(): void {
    const savedContext = this.extensionContext.globalState.get<ContextItem[]>('context');

    if (savedContext && Array.isArray(savedContext)) {
      this.context = savedContext;
    }
  }

  /**
   * Prune context if it exceeds the configured limit
   */
  private pruneContextIfNeeded(): void {
    const config = this.configService.getConfig();
    const maxContextSize = config.contextWindowSize;

    // Very simple pruning strategy for MVP: remove oldest items
    // In a full implementation, we'd use more sophisticated token counting and relevance
    if (this.context.length > 20) {
      // Sort by timestamp (oldest first)
      this.context.sort((a, b) => a.timestamp - b.timestamp);

      // Remove oldest items
      this.context = this.context.slice(-20);

      // Re-sort by relevance
      this.context.sort((a, b) => b.relevance - a.relevance);
    }
  }
}