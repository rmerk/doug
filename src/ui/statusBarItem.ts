import * as vscode from 'vscode';
import { OpenRouterModel } from '../types/openRouter';

export class StatusBarManager {
  private statusBarItem: vscode.StatusBarItem;

  constructor() {
    // Create status bar item with higher priority to ensure visibility
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      1000 // Higher priority for better visibility
    );

    this.statusBarItem.command = 'doug.openChatPanel';
    this.statusBarItem.text = `$(comment) Doug AI`;
    this.statusBarItem.tooltip = 'Click to open Doug AI Assistant';

    // Ensure visibility
    this.statusBarItem.show();

    // Log for debugging
    console.log('Doug AI status bar item created and shown');
  }

  /**
   * Update the status bar with selected model
   */
  public updateModel(model: OpenRouterModel | null): void {
    if (model) {
      this.statusBarItem.text = `$(comment) AI: ${model.name}`;
      this.statusBarItem.tooltip = `AI Assistant: ${model.name} by ${model.provider}`;
    } else {
      this.statusBarItem.text = `$(comment) AI Assistant`;
      this.statusBarItem.tooltip = 'AI Assistant: No model selected';
    }
  }

  /**
   * Update status bar during processing
   */
  public showLoading(): void {
    this.statusBarItem.text = `$(sync~spin) AI Assistant`;
    this.statusBarItem.tooltip = 'AI Assistant is processing...';
  }

  /**
   * Reset status bar to default state
   */
  public updateStatus(message?: string): void {
    if (message) {
      this.statusBarItem.text = `$(comment) AI: ${message}`;
      this.statusBarItem.tooltip = `AI Assistant: ${message}`;
    } else {
      this.statusBarItem.text = `$(comment) AI Assistant`;
      this.statusBarItem.tooltip = 'Click to open AI Assistant';
    }
  }

  /**
   * Dispose the status bar item
   */
  public dispose(): void {
    this.statusBarItem.dispose();
  }
}