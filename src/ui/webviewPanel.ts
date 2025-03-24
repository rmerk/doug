import * as vscode from 'vscode';
import { WebviewMessage } from '../types/extension';
import { OpenRouterModel, OpenRouterChatMessage } from '../types/openRouter';

export class ChatWebviewPanel {
  public static currentPanel: ChatWebviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private extensionUri: vscode.Uri,
    private selectedModel: OpenRouterModel | null,
    private messages: OpenRouterChatMessage[],
    private onSendMessage: (message: string) => void,
    private onChangeModel: () => void
  ) {
    this.panel = panel;

    // Set the webview's HTML content
    this.updateContent();

    // Listen for when the panel is disposed
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    // Update the content based on view changes
    this.panel.onDidChangeViewState(
      e => {
        if (this.panel.visible) {
          this.updateContent();
        }
      },
      null,
      this.disposables
    );

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      async (message: WebviewMessage) => {
        switch (message.command) {
          case 'sendMessage':
            if (message.payload && typeof message.payload === 'string') {
              this.onSendMessage(message.payload);
            }
            break;
          case 'changeModel':
            this.onChangeModel();
            break;
          case 'testConnection':
            void vscode.commands.executeCommand('doug.testConnection');
            break;
          case 'openPrivacySettings':
            void vscode.env.openExternal(vscode.Uri.parse('https://openrouter.ai/settings/privacy'));
            break;
        }
      },
      null,
      this.disposables
    );
  }

  public static createOrShow(
    extensionUri: vscode.Uri,
    selectedModel: OpenRouterModel | null,
    messages: OpenRouterChatMessage[],
    onSendMessage: (message: string) => void,
    onChangeModel: () => void
  ): ChatWebviewPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (ChatWebviewPanel.currentPanel) {
      ChatWebviewPanel.currentPanel.panel.reveal(column);
      ChatWebviewPanel.currentPanel.updateModel(selectedModel);
      ChatWebviewPanel.currentPanel.updateMessages(messages);
      return ChatWebviewPanel.currentPanel;
    }

    try {
      console.log('Creating new chat webview panel');

      // Create a new panel
      const panel = vscode.window.createWebviewPanel(
        'aiAssistantChat',
        'Doug AI Assistant',
        column || vscode.ViewColumn.One,
        {
          enableScripts: true,
          localResourceRoots: [
            vscode.Uri.joinPath(extensionUri, 'media'),
            extensionUri // Add extension root to allow loading resources
          ],
          retainContextWhenHidden: true,
        }
      );

      ChatWebviewPanel.currentPanel = new ChatWebviewPanel(
        panel,
        extensionUri,
        selectedModel,
        messages,
        onSendMessage,
        onChangeModel
      );

      // Log for debugging
      console.log('Webview panel created successfully');

      return ChatWebviewPanel.currentPanel;
    } catch (error) {
      console.error('Error creating webview panel:', error);
      vscode.window.showErrorMessage(`Failed to create Doug AI panel: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  public updateModel(model: OpenRouterModel | null): void {
    this.selectedModel = model;
    this.updateContent();
  }

  public updateMessages(messages: OpenRouterChatMessage[]): void {
    this.messages = messages;
    this.updateContent();
  }

  public updateLoadingState(isLoading: boolean): void {
    void this.panel.webview.postMessage({
      command: 'updateLoadingState',
      payload: isLoading
    });
  }

  public appendAssistantMessage(content: string): void {
    void this.panel.webview.postMessage({
      command: 'appendAssistantMessage',
      payload: content
    });
  }

  public showTroubleshooting(message?: string): void {
    void this.panel.webview.postMessage({
      command: 'showTroubleshooting',
      payload: { message }
    });
  }

  private updateContent(): void {
    this.panel.webview.html = this.getHtmlForWebview();
  }

  private getHtmlForWebview(): string {
    // Format the messages for display
    const formattedMessages = this.messages
      .map(msg => {
        const role = msg.role.charAt(0).toUpperCase() + msg.role.slice(1);
        // Simple markdown-like formatting for code blocks
        const content = msg.content
          .replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
          .replace(/`([^`]+)`/g, '<code>$1</code>')
          .replace(/\n/g, '<br>');

        return `
          <div class="message ${msg.role}">
            <div class="message-header">${role}</div>
            <div class="message-content">${content}</div>
          </div>
        `;
      })
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI Assistant</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
          }
          .container {
            display: flex;
            flex-direction: column;
            height: 100vh;
          }
          .header {
            padding: 10px 15px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          .model-info {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
          }
          .messages {
            flex: 1;
            overflow-y: auto;
            padding: 15px;
          }
          .message {
            margin-bottom: 15px;
            padding: 10px;
            border-radius: 5px;
          }
          .message.user {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
          }
          .message.assistant {
            background-color: var(--vscode-editor-selectionBackground);
          }
          .message.system {
            background-color: var(--vscode-editorInfo-background);
            font-style: italic;
          }
          .message-header {
            font-weight: bold;
            margin-bottom: 5px;
          }
          .message-content {
            line-height: 1.4;
          }
          .message-content code {
            font-family: var(--vscode-editor-font-family);
            background-color: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 3px;
          }
          .message-content pre {
            margin: 10px 0;
          }
          .message-content pre code {
            display: block;
            padding: 10px;
            border-radius: 5px;
            overflow-x: auto;
          }
          .input-area {
            padding: 15px;
            border-top: 1px solid var(--vscode-panel-border);
          }
          .input-container {
            display: flex;
            gap: 10px;
          }
          textarea {
            flex: 1;
            min-height: 60px;
            resize: vertical;
            padding: 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 3px;
          }
          button {
            padding: 8px 15px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 3px;
            cursor: pointer;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          button:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .command-buttons {
            display: flex;
            gap: 10px;
            margin-top: 10px;
            justify-content: flex-end;
          }
          .troubleshooting {
            margin-top: 15px;
            padding: 10px;
            background-color: var(--vscode-editorWidget-background);
            border-radius: 5px;
          }
          .troubleshooting h3 {
            margin-top: 0;
          }
          .troubleshooting button {
            margin-top: 5px;
          }
          .hidden {
            display: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="model-info">
              Selected model: <strong>${this.selectedModel ? this.selectedModel.name : 'None selected'}</strong>
            </div>
            <button id="change-model-button">Change Model</button>
          </div>

          <div class="messages" id="messages-container">
            ${formattedMessages ||
              '<div class="message system"><div class="message-content">Welcome to Doug! No messages yet. Start a conversation below.</div></div>'}
          </div>

          <div class="input-area">
            <div class="input-container">
              <textarea id="message-input" placeholder="Ask a question..."></textarea>
              <button id="send-button">Send</button>
            </div>

            <div class="command-buttons">
              <button id="test-connection-button">Test Connection</button>
            </div>

            <div id="troubleshooting-section" class="troubleshooting hidden">
              <h3>Troubleshooting OpenRouter</h3>
              <p id="troubleshooting-message">If you're having connection issues with OpenRouter, try these steps:</p>
              <ul>
                <li>Check your API key is valid and properly formatted (starting with sk-or-v1-)</li>
                <li>Verify your OpenRouter account has access to the selected model</li>
                <li>Check your OpenRouter privacy settings at <a href="#" id="privacy-settings-link">openrouter.ai/settings/privacy</a></li>
              </ul>
              <button id="hide-troubleshooting-button">Hide</button>
            </div>
          </div>
        </div>

        <script>
          // Get DOM elements
          const vscode = acquireVsCodeApi();
          const messagesContainer = document.getElementById('messages-container');
          const messageInput = document.getElementById('message-input');
          const sendButton = document.getElementById('send-button');
          const changeModelButton = document.getElementById('change-model-button');
          const testConnectionButton = document.getElementById('test-connection-button');
          const troubleshootingSection = document.getElementById('troubleshooting-section');
          const hideTroubleshootingButton = document.getElementById('hide-troubleshooting-button');
          const privacySettingsLink = document.getElementById('privacy-settings-link');

          // Scroll to the bottom of the messages
          function scrollToBottom() {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
          scrollToBottom();

          // Handle sending a message
          function sendMessage() {
            const message = messageInput.value.trim();
            if (message) {
              vscode.postMessage({
                command: 'sendMessage',
                payload: message
              });

              // Clear the input
              messageInput.value = '';

              // Disable the send button while processing
              sendButton.disabled = true;
            }
          }

          // Listen for enter key press in the textarea
          messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          });

          // Send button click handler
          sendButton.addEventListener('click', sendMessage);

          // Change model button handler
          changeModelButton.addEventListener('click', () => {
            vscode.postMessage({
              command: 'changeModel'
            });
          });

          // Test connection button handler
          testConnectionButton.addEventListener('click', () => {
            vscode.postMessage({
              command: 'testConnection'
            });
          });

          // Privacy settings link handler
          privacySettingsLink.addEventListener('click', (e) => {
            e.preventDefault();
            vscode.postMessage({
              command: 'openPrivacySettings'
            });
          });

          // Hide troubleshooting section handler
          hideTroubleshootingButton.addEventListener('click', () => {
            troubleshootingSection.classList.add('hidden');
          });

          // Listen for messages from the extension
          window.addEventListener('message', event => {
            const message = event.data;

            switch (message.command) {
              case 'updateLoadingState':
                sendButton.disabled = message.payload;
                break;

              case 'appendAssistantMessage':
                // In a full implementation, we would add proper rendering
                // For now, just reloading the entire webview when messages change
                break;

              case 'showTroubleshooting':
                troubleshootingSection.classList.remove('hidden');
                if (message.payload && message.payload.message) {
                  document.getElementById('troubleshooting-message').textContent = message.payload.message;
                }
                break;
            }
          });
        </script>
      </body>
      </html>
    `;
  }

  private dispose(): void {
    ChatWebviewPanel.currentPanel = undefined;

    // Clean up resources
    this.panel.dispose();

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}