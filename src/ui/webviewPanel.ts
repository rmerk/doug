import * as vscode from 'vscode';
import { WebviewMessage } from '../types/extension';
import { OpenRouterModel, OpenRouterChatMessage } from '../types/openRouter';
import { ChatHistoryService, ChatHistoryItem } from '../services/chatHistoryService';
import { formatRelativeTime } from '../utils/dateUtils';

export class ChatWebviewPanel {
  public static currentPanel: ChatWebviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];
  private chatHistory: ChatHistoryItem[] = [];
  private currentChatId: string | null = null;

  private constructor(
    panel: vscode.WebviewPanel,
    private extensionUri: vscode.Uri,
    private selectedModel: OpenRouterModel | null,
    private messages: OpenRouterChatMessage[],
    private onSendMessage: (message: string) => void,
    private onChangeModel: () => void
  ) {
    this.panel = panel;

    // Load chat history
    this.loadChatHistory();

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
              // Update or create chat in history if there are messages
              if (this.messages.length > 0) {
                await this.saveCurrentChat();
              }
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
          case 'deleteChat':
            if (message.payload && typeof message.payload === 'string') {
              await this.deleteChat(message.payload);
            }
            break;
          case 'loadChat':
            if (message.payload && typeof message.payload === 'string') {
              await this.loadChat(message.payload);
            }
            break;
          case 'newChat':
            this.startNewChat();
            break;
        }
      },
      null,
      this.disposables
    );
  }

  private async loadChatHistory(): Promise<void> {
    this.chatHistory = await ChatHistoryService.getChats();
    console.log('Loaded chat history:', this.chatHistory.length, 'items');
    this.updateContent();
  }

  private async saveCurrentChat(): Promise<void> {
    if (this.messages.length === 0) {
      return;
    }

    try {
      let chat: ChatHistoryItem;
      const title = ChatHistoryService.generateTitleFromMessages(this.messages);

      if (this.currentChatId) {
        // Update existing chat
        const updatedChat = await ChatHistoryService.updateChatMessages(this.currentChatId, this.messages);
        if (!updatedChat) {
          // If chat no longer exists, create a new one
          chat = await ChatHistoryService.createChat(title, this.messages);
          this.currentChatId = chat.id;
        }
      } else {
        // Create new chat
        chat = await ChatHistoryService.createChat(title, this.messages);
        this.currentChatId = chat.id;
      }

      // Refresh chat history
      await this.loadChatHistory();
    } catch (error) {
      console.error('Error saving chat:', error);
    }
  }

  private async deleteChat(chatId: string): Promise<void> {
    try {
      await ChatHistoryService.deleteChat(chatId);

      // If we deleted the current chat, start a new one
      if (chatId === this.currentChatId) {
        this.startNewChat();
      }

      // Refresh chat history
      await this.loadChatHistory();

      // Notify the webview that deletion was successful so it can clear any local state
      void this.panel.webview.postMessage({
        command: 'chatDeleted',
        payload: chatId
      });
    } catch (error) {
      console.error(`Error deleting chat ${chatId}:`, error);
    }
  }

  private async loadChat(chatId: string): Promise<void> {
    try {
      const chats = await ChatHistoryService.getChats();
      const chat = chats.find(c => c.id === chatId);

      if (chat) {
        this.currentChatId = chat.id;
        this.messages = [...chat.messages];
        this.updateContent();
      }
    } catch (error) {
      console.error(`Error loading chat ${chatId}:`, error);
    }
  }

  private startNewChat(): void {
    this.currentChatId = null;
    this.messages = [];
    this.updateContent();
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
    // Save chat when messages are updated
    void this.saveCurrentChat();
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

    // Ensure event handlers are reattached when content is updated
    // But no direct setupEventHandlers call in TypeScript code
    void this.panel.webview.postMessage({
      command: 'setupEventHandlers'
    });
  }

  private getHtmlForWebview(): string {
    console.log('Rendering webview HTML with', this.chatHistory.length, 'chat history items');

    // Format chat history - completely rewritten section
    let historyContent = '';

    if (this.chatHistory.length > 0) {
      historyContent = `
        <div class="today-section">Today</div>
        <div class="history-items">
      `;

      // Add each chat history item
      for (const chat of this.chatHistory) {
        const formattedTime = formatRelativeTime(chat.lastInteractionAt);
        const truncatedTitle = chat.title.length > 30 ? `${chat.title.slice(0, 30)}...` : chat.title;
        const isActive = chat.id === this.currentChatId;

        historyContent += `
          <div class="history-item ${isActive ? 'active' : ''}" data-id="${chat.id}">
            <div class="history-info" onclick="loadChat('${chat.id}')">
              <div class="history-title" title="${chat.title}">${truncatedTitle}</div>
              <div class="history-time">${formattedTime}</div>
            </div>
            <div class="history-delete-btn" data-chat-id="${chat.id}" title="Delete chat" onclick="deleteChat('${chat.id}', event)">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"></path>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
              </svg>
            </div>
          </div>
        `;
      }

      historyContent += `</div>`;
    } else {
      historyContent = '<div class="no-history">No chat history yet</div>';
    }

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

    // Create HTML with chat history popover and chat content
    return /* html */`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this.panel.webview.cspSource} 'unsafe-inline'; script-src ${this.panel.webview.cspSource} 'unsafe-inline'; img-src ${this.panel.webview.cspSource} https:;">
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
          .app-container {
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
            position: relative;
          }
          .header-left {
            display: flex;
            align-items: center;
            gap: 10px;
          }
          .history-button {
            background: none;
            border: none;
            cursor: pointer;
            color: var(--vscode-foreground);
            padding: 5px;
            display: flex;
            align-items: center;
            opacity: 0.8;
            border-radius: 3px;
          }
          .history-button:hover {
            opacity: 1;
            background-color: var(--vscode-list-hoverBackground);
          }
          .history-button svg {
            margin-right: 5px;
          }
          .chat-history-popover {
            position: absolute;
            top: 50px;
            left: 15px;
            width: 300px;
            max-height: 400px;
            background-color: var(--vscode-editorWidget-background);
            border: 1px solid var(--vscode-editorWidget-border);
            border-radius: 6px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            z-index: 1000;
            overflow: hidden;
            display: none;
            flex-direction: column;
          }
          .popover-header {
            padding: 12px 15px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .popover-header h3 {
            margin: 0;
            font-size: 14px;
          }
          .chat-history {
            overflow-y: auto;
            max-height: 350px;
          }
          .history-items {
            margin: 0;
            padding: 0;
          }
          .history-item {
            padding: 10px 15px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            transition: background-color 0.2s;
          }
          .today-section {
            padding: 5px 15px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            border-bottom: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editorWidget-background);
          }
          .history-item:hover {
            background-color: var(--vscode-list-hoverBackground);
          }
          .history-item.active {
            background-color: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
          }
          .history-info {
            flex: 1;
            cursor: pointer;
            overflow: hidden;
          }
          .history-title {
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .history-time {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
          }
          .history-delete-btn {
            background: none;
            border: none;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            padding: 4px;
            border-radius: 3px;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0.6;
            min-width: 28px;
            min-height: 28px;
          }
          .history-delete-btn:hover {
            opacity: 1;
            background-color: var(--vscode-editor-hoverHighlightBackground);
          }
          .history-delete-btn svg {
            cursor: pointer;
          }
          .history-item.active .history-time {
            color: var(--vscode-list-activeSelectionForeground);
            opacity: 0.8;
          }
          .new-chat-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
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
          #user-input {
            width: 100%;
            height: 80px;
            resize: none;
            padding: 10px;
            border: 1px solid var(--vscode-input-border);
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border-radius: 3px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
          }
          #user-input:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
          }
          .buttons {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
          }
          .send-btn {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 12px;
            border-radius: 3px;
            cursor: pointer;
          }
          .send-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }
          .action-link {
            color: var(--vscode-textLink-foreground);
            background: none;
            border: none;
            padding: 0;
            font: inherit;
            cursor: pointer;
            text-decoration: underline;
          }
          .loading-indicator {
            display: none;
            margin-top: 10px;
            color: var(--vscode-descriptionForeground);
          }
          .troubleshooting {
            display: none;
            margin-top: 15px;
            padding: 10px;
            border-radius: 3px;
            background-color: var(--vscode-inputValidation-infoBackground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
          }
          .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            color: var(--vscode-descriptionForeground);
            padding: 20px;
            text-align: center;
          }
          .empty-state h2 {
            margin-bottom: 10px;
          }
          .no-history {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
          }
        </style>
      </head>
      <body>
        <div class="app-container">
          <div class="header">
            <div class="header-left">
              <button class="history-button" onclick="toggleHistoryPopover()" title="Chat History">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 3h18v18H3zM3 8h18M8 3v18"></path>
                </svg>
                Doug AI Assistant
              </button>

              <!-- Chat History Popover -->
              <div class="chat-history-popover" id="historyPopover">
                <div class="popover-header">
                  <h3>Chat History</h3>
                  <button class="new-chat-btn" onclick="startNewChat()">New Chat</button>
                </div>
                <div class="chat-history">
                  ${historyContent}
                </div>
              </div>
            </div>

            <div class="model-info">
              ${this.selectedModel ? `Model: ${this.selectedModel.name} <button class="action-link" onclick="changeModel()">Change</button>` : `
                No model selected <button class="action-link" onclick="changeModel()">Select Model</button>
              `}
            </div>
          </div>

          <div class="messages" id="messages">
            ${formattedMessages.length ? formattedMessages : `
              <div class="empty-state">
                <h2>Welcome to Doug AI Assistant</h2>
                <p>Start a conversation by typing a message below.</p>
              </div>
            `}
          </div>

          <div class="troubleshooting" id="troubleshooting">
            <p id="troubleshooting-message">Looks like there might be a connection issue.</p>
            <p>
              <button class="action-link" onclick="testConnection()">Test connection</button> or
              <button class="action-link" onclick="openPrivacySettings()">check your privacy settings</button>
            </p>
          </div>

          <div class="input-area">
            <textarea id="user-input" placeholder="Type your message..." rows="3"></textarea>
            <div class="buttons">
              <div class="loading-indicator" id="loading-indicator">Processing...</div>
              <button class="send-btn" id="send-button" onclick="sendMessage()">Send</button>
            </div>
          </div>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          const messagesContainer = document.getElementById('messages');
          const userInput = document.getElementById('user-input');
          const sendButton = document.getElementById('send-button');
          const loadingIndicator = document.getElementById('loading-indicator');
          const troubleshootingSection = document.getElementById('troubleshooting');
          const troubleshootingMessage = document.getElementById('troubleshooting-message');
          const historyPopover = document.getElementById('historyPopover');

          // Scroll to bottom of messages
          function scrollToBottom() {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }

          // Initialize with scroll to bottom
          scrollToBottom();

          // Focus on input
          userInput.focus();

          // Add event listeners for delete buttons - improved with better error handling and debugging
          function setupDeleteButtons() {
            console.log('Setting up delete buttons');
            const deleteButtons = document.querySelectorAll('.history-delete-btn');
            console.log('Found', deleteButtons.length, 'delete buttons');

            deleteButtons.forEach(button => {
              // Remove any existing event listeners to prevent duplicates
              const newButton = button.cloneNode(true);
              button.parentNode.replaceChild(newButton, button);

              newButton.addEventListener('click', function(event) {
                console.log('Delete button clicked');
                // Stop event propagation immediately
                event.stopPropagation();
                event.preventDefault();

                const chatId = this.getAttribute('data-chat-id');
                console.log('Chat ID to delete:', chatId);

                if (chatId) {
                  if (confirm('Are you sure you want to delete this chat?')) {
                    try {
                      console.log('Confirmed deletion of chat:', chatId);
                      vscode.postMessage({
                        command: 'deleteChat',
                        payload: chatId
                      });

                      // Visual feedback that delete was requested
                      const chatItem = this.closest('.history-item');
                      if (chatItem) {
                        chatItem.style.opacity = '0.5';
                      }
                    } catch (error) {
                      console.error('Error sending delete message:', error);
                      alert('Failed to delete chat. Please try again.');
                    }
                  }
                } else {
                  console.error('No chat ID found for delete button');
                }
              });
            });
          }

          // Run setup when the DOM is fully loaded
          document.addEventListener('DOMContentLoaded', setupDeleteButtons);

          // Also run setup immediately in case the DOM is already loaded
          setupDeleteButtons();

          // Toggle history popover visibility
          function toggleHistoryPopover() {
            if (historyPopover.style.display === 'flex') {
              historyPopover.style.display = 'none';
            } else {
              historyPopover.style.display = 'flex';
              // Re-attach event listeners when popover is opened
              setupDeleteButtons();
            }
          }

          // Click outside to close popover
          document.addEventListener('click', (e) => {
            const isHistoryButton = e.target.closest('.history-button');
            const isHistoryPopover = e.target.closest('.chat-history-popover');

            if (!isHistoryButton && !isHistoryPopover && historyPopover.style.display === 'flex') {
              historyPopover.style.display = 'none';
            }
          });

          // Handle sending a message
          function sendMessage() {
            const message = userInput.value.trim();
            if (!message) return;

            // Send message to extension
            vscode.postMessage({
              command: 'sendMessage',
              payload: message
            });

            // Clear input
            userInput.value = '';

            // Focus back on input
            userInput.focus();

            // Close history popover if open
            historyPopover.style.display = 'none';
          }

          // Handle model change request
          function changeModel() {
            vscode.postMessage({
              command: 'changeModel'
            });

            // Close history popover if open
            historyPopover.style.display = 'none';
          }

          // Handle test connection
          function testConnection() {
            vscode.postMessage({
              command: 'testConnection'
            });
          }

          // Handle privacy settings
          function openPrivacySettings() {
            vscode.postMessage({
              command: 'openPrivacySettings'
            });
          }

          // Load chat
          function loadChat(chatId) {
            vscode.postMessage({
              command: 'loadChat',
              payload: chatId
            });

            // Close history popover
            historyPopover.style.display = 'none';
          }

          // Start new chat
          function startNewChat() {
            vscode.postMessage({
              command: 'newChat'
            });

            // Close history popover
            historyPopover.style.display = 'none';
          }

          // Handle enter key to send
          userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          });

          // Listen for messages from the extension
          window.addEventListener('message', event => {
            const message = event.data;

            switch (message.command) {
              case 'updateLoadingState':
                if (message.payload) {
                  loadingIndicator.style.display = 'block';
                  sendButton.disabled = true;
                } else {
                  loadingIndicator.style.display = 'none';
                  sendButton.disabled = false;
                  scrollToBottom();
                }
                break;

              case 'appendAssistantMessage':
                // This would be handled if implementing streaming
                scrollToBottom();
                break;

              case 'showTroubleshooting':
                troubleshootingSection.style.display = 'block';
                if (message.payload && message.payload.message) {
                  troubleshootingMessage.textContent = message.payload.message;
                }
                break;

              case 'chatDeleted':
                // Remove the deleted chat from the UI immediately without waiting for a refresh
                if (message.payload) {
                  const deletedChatId = message.payload;
                  const selector = '.history-item[data-id="' + deletedChatId + '"]';
                  const chatElement = document.querySelector(selector);
                  if (chatElement) {
                    chatElement.remove();
                    console.log('Removed chat with ID ' + deletedChatId + ' from UI');

                    // If no more chat items, show empty state
                    const historyItems = document.querySelectorAll('.history-item');
                    if (historyItems.length === 0) {
                      const chatHistory = document.querySelector('.chat-history');
                      if (chatHistory) {
                        chatHistory.innerHTML = '<div class="no-history">No chat history yet</div>';
                      }
                    }
                  }
                }
                break;

              case 'setupEventHandlers':
                // Setup delete buttons and other event handlers
                setupDeleteButtons();
                break;
            }
          });

          // For debugging
          console.log("History popover initialized");

          // Also add direct delete function to avoid event listener issues
          function deleteChat(chatId, event) {
            // Stop event propagation
            if (event) {
              event.stopPropagation();
              event.preventDefault();
            }

            console.log('Delete chat function called for chat ID:', chatId);

            if (chatId && confirm('Are you sure you want to delete this chat?')) {
              try {
                console.log('Confirmed deletion of chat:', chatId);
                vscode.postMessage({
                  command: 'deleteChat',
                  payload: chatId
                });

                // Visual feedback
                const chatItem = document.querySelector('.history-item[data-id="' + chatId + '"]');
                if (chatItem) {
                  chatItem.style.opacity = '0.5';
                }
              } catch (error) {
                console.error('Error sending delete message:', error);
                alert('Failed to delete chat. Please try again.');
              }
            }
          }
        </script>
      </body>
      </html>` as string;
  }

  private dispose(): void {
    ChatWebviewPanel.currentPanel = undefined;

    // Clean up our resources
    this.panel.dispose();

    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }
}