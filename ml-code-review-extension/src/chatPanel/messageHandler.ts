import * as vscode from 'vscode';
import { ChatMessage } from '../types';
import { BackendAPI } from '../backendAPI';

export class MessageHandler {
  private messages: ChatMessage[] = [];
  private api: BackendAPI;

  constructor(api: BackendAPI) {
    this.api = api;
  }

  public getMessages(): ChatMessage[] {
    return this.messages;
  }

  public clearMessages(): void {
    this.messages = [];
  }

  public addMessage(role: 'user' | 'assistant', content: string): void {
    const message: ChatMessage = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date()
    };
    this.messages.push(message);
  }

  public async handleUserMessage(content: string): Promise<void> {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };

    this.messages.push(userMessage);

    try {
      const response = await this.api.sendChatMessage(content);
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.response || 'Sorry, I could not process your request.',
        timestamp: new Date()
      };

      this.messages.push(assistantMessage);
    } catch (error: any) {
      console.error('Chat error details:', error);
      
      let errorText = 'Sorry, I encountered an error. Please try again.';
      if (error?.code === 'ECONNREFUSED') {
        errorText = 'Cannot connect to backend server. Make sure app.py is running on port 8000.';
      } else if (error?.message) {
        errorText = `Error: ${error.message}`;
      }
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorText,
        timestamp: new Date()
      };

      this.messages.push(errorMessage);
    }
  }
}