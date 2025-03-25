import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { OpenRouterChatMessage } from '../types/openRouter';

export interface ChatHistoryItem {
  id: string;
  title: string;
  lastInteractionAt: Date;
  messages: OpenRouterChatMessage[];
}

// Helper function to truncate text with ellipsis
function truncateWithEllipsis(text: string, maxLength: number): string {
  if (text.length <= maxLength) {return text;}
  return text.slice(0, maxLength) + '...';
}

export class ChatHistoryService {
  private static storageDirectory: string;

  public static initialize(context: vscode.ExtensionContext): void {
    this.storageDirectory = path.join(context.globalStorageUri.fsPath, 'chat-history');

    // Ensure storage directory exists
    if (!fs.existsSync(this.storageDirectory)) {
      fs.mkdirSync(this.storageDirectory, { recursive: true });
    }
  }

  public static async getChats(): Promise<ChatHistoryItem[]> {
    try {
      if (!fs.existsSync(this.storageDirectory)) {
        return [];
      }

      const files = fs.readdirSync(this.storageDirectory)
        .filter(filename => filename.endsWith('.json'));

      const chatPromises = files.map(async (filename) => {
        const filePath = path.join(this.storageDirectory, filename);
        try {
          const data = fs.readFileSync(filePath, 'utf-8');
          const chatData = JSON.parse(data) as ChatHistoryItem;
          // Ensure dates are parsed properly
          chatData.lastInteractionAt = new Date(chatData.lastInteractionAt);
          return chatData;
        } catch (err) {
          console.error(`Error reading chat file ${filename}:`, err);
          return null;
        }
      });

      const chats = (await Promise.all(chatPromises))
        .filter((chat): chat is ChatHistoryItem => chat !== null)
        // Sort by most recent first
        .sort((a, b) => b.lastInteractionAt.getTime() - a.lastInteractionAt.getTime());

      return chats;
    } catch (err) {
      console.error('Error getting chat history:', err);
      return [];
    }
  }

  public static async saveChat(chat: ChatHistoryItem): Promise<void> {
    try {
      const filePath = path.join(this.storageDirectory, `${chat.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(chat, null, 2), 'utf-8');
    } catch (err) {
      console.error('Error saving chat:', err);
      throw err;
    }
  }

  public static async deleteChat(chatId: string): Promise<boolean> {
    try {
      const filePath = path.join(this.storageDirectory, `${chatId}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (err) {
      console.error(`Error deleting chat ${chatId}:`, err);
      return false;
    }
  }

  public static async createChat(title: string, messages: OpenRouterChatMessage[]): Promise<ChatHistoryItem> {
    const id = Date.now().toString();
    const chat: ChatHistoryItem = {
      id,
      title: title || 'New Chat',
      lastInteractionAt: new Date(),
      messages: [...messages]
    };

    await this.saveChat(chat);
    return chat;
  }

  public static async updateChatMessages(
    chatId: string,
    messages: OpenRouterChatMessage[]
  ): Promise<ChatHistoryItem | null> {
    try {
      const filePath = path.join(this.storageDirectory, `${chatId}.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = fs.readFileSync(filePath, 'utf-8');
      const chat = JSON.parse(data) as ChatHistoryItem;

      chat.messages = [...messages];
      chat.lastInteractionAt = new Date();

      await this.saveChat(chat);
      return chat;
    } catch (err) {
      console.error(`Error updating chat ${chatId}:`, err);
      return null;
    }
  }

  // Helper to generate a title from messages
  public static generateTitleFromMessages(messages: OpenRouterChatMessage[]): string {
    // Find first user message
    const firstUserMessage = messages.find(msg => msg.role === 'user');
    if (!firstUserMessage) {return 'New Chat';}

    // Extract first line or first N characters
    const content = firstUserMessage.content;
    const firstLine = content.split('\n')[0].trim();

    if (firstLine.length === 0) {return 'New Chat';}

    // Return truncated first line
    return truncateWithEllipsis(firstLine, 50);
  }
}