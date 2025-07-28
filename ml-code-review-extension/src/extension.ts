import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface NotebookCell {
  cell_type: string;
  source: string[];
  outputs?: any[];
  execution_count?: number;
}

interface NotebookData {
  cells: NotebookCell[];
  metadata: any;
  nbformat: number;
  nbformat_minor: number;
}

class NotebookReader {
  static readNotebook(filePath: string): NotebookData | null {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content) as NotebookData;
    } catch (error) {
      console.error('Error reading notebook:', error);
      return null;
    }
  }

  static extractCodeCells(notebook: NotebookData): string[] {
    return notebook.cells
      .filter(cell => cell.cell_type === 'code')
      .map(cell => cell.source.join(''));
  }

  static extractMarkdownCells(notebook: NotebookData): string[] {
    return notebook.cells
      .filter(cell => cell.cell_type === 'markdown')
      .map(cell => cell.source.join(''));
  }
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

class BackendAPI {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async analyzeCode(code: string, imageData?: string): Promise<any> {
    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      const parsedUrl = url.parse(`${this.baseUrl}/analyze`);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const postData = JSON.stringify({
        code,
        image: imageData
      });

      return new Promise((resolve, reject) => {
        const req = client.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
      });
    } catch (error) {
      console.error('Backend API error:', error);
      throw error;
    }
  }

  async sendChatMessage(message: string, context?: any): Promise<any> {
    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      const parsedUrl = url.parse(`${this.baseUrl}/chat`);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const postData = JSON.stringify({
        message,
        context
      });

      return new Promise((resolve, reject) => {
        const req = client.request({
          hostname: parsedUrl.hostname,
          port: parsedUrl.port,
          path: parsedUrl.path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          });
        });

        req.on('error', reject);
        req.write(postData);
        req.end();
      });
    } catch (error) {
      console.error('Chat API error:', error);
      throw error;
    }
  }
}

class ChatPanel {
  private panel: vscode.WebviewPanel | undefined;
  private messages: ChatMessage[] = [];
  private api: BackendAPI;
  private context: vscode.ExtensionContext;

  constructor(api: BackendAPI, context: vscode.ExtensionContext) {
    this.api = api;
    this.context = context;
  }

  public show() {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Two);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'mlCodeReviewChat',
      'ML Code Review Chat',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = this.getChatWebviewContent();
    this.setupWebviewMessageHandling();

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  private setupWebviewMessageHandling() {
    if (!this.panel) return;

    this.panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'sendMessage':
          await this.handleUserMessage(message.content);
          break;
        case 'clearChat':
          this.clearMessages();
          break;
      }
    });
  }

  private async handleUserMessage(content: string) {
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date()
    };

    this.messages.push(userMessage);
    this.updateWebview();

    try {
      const response = await this.api.sendChatMessage(content);
      
      const assistantMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.message || response.response || 'No response received',
        timestamp: new Date()
      };

      this.messages.push(assistantMessage);
      this.updateWebview();
    } catch (error) {
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Error: ${error}`,
        timestamp: new Date()
      };

      this.messages.push(errorMessage);
      this.updateWebview();
    }
  }

  private clearMessages() {
    this.messages = [];
    this.updateWebview();
  }

  private updateWebview() {
    if (this.panel) {
      this.panel.webview.html = this.getChatWebviewContent();
    }
  }

  private getChatWebviewContent(): string {
    const messagesHtml = this.messages.map(msg => `
      <div class="message ${msg.role}">
        <div class="message-header">
          <span class="role">${msg.role === 'user' ? 'You' : 'AI Assistant'}</span>
          <span class="timestamp">${msg.timestamp.toLocaleTimeString()}</span>
        </div>
        <div class="message-content">${this.escapeHtml(msg.content)}</div>
      </div>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ML Code Review Chat</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            flex-direction: column;
            background: #f5f5f5;
        }
        .chat-header {
            background: #007acc;
            color: white;
            padding: 15px;
            text-align: center;
            font-weight: bold;
        }
        .chat-messages {
            flex: 1;
            overflow-y: auto;
            padding: 20px;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }
        .message {
            max-width: 80%;
            padding: 12px 16px;
            border-radius: 12px;
            word-wrap: break-word;
        }
        .message.user {
            align-self: flex-end;
            background: #007acc;
            color: white;
        }
        .message.assistant {
            align-self: flex-start;
            background: white;
            border: 1px solid #ddd;
            color: #333;
        }
        .message-header {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            margin-bottom: 6px;
            opacity: 0.8;
        }
        .message-content {
            white-space: pre-wrap;
            line-height: 1.4;
        }
        .chat-input {
            display: flex;
            padding: 15px;
            background: white;
            border-top: 1px solid #ddd;
            gap: 10px;
        }
        .input-field {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
            resize: none;
            min-height: 20px;
            max-height: 100px;
        }
        .send-button, .clear-button {
            padding: 10px 16px;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
        }
        .send-button {
            background: #007acc;
            color: white;
        }
        .send-button:hover {
            background: #005a9e;
        }
        .send-button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .clear-button {
            background: #f44336;
            color: white;
        }
        .clear-button:hover {
            background: #d32f2f;
        }
        .empty-state {
            text-align: center;
            color: #666;
            font-style: italic;
            margin-top: 50px;
        }
    </style>
</head>
<body>
    <div class="chat-header">
        ML Code Review Chat Assistant
    </div>
    <div class="chat-messages" id="messages">
        ${messagesHtml || '<div class="empty-state">Start a conversation about your ML code...</div>'}
    </div>
    <div class="chat-input">
        <textarea 
            id="messageInput" 
            class="input-field" 
            placeholder="Ask about your ML code, request analysis, or chat about best practices..."
            rows="1"
        ></textarea>
        <button id="sendButton" class="send-button">Send</button>
        <button id="clearButton" class="clear-button">Clear</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        const clearButton = document.getElementById('clearButton');
        const messages = document.getElementById('messages');

        function sendMessage() {
            const content = messageInput.value.trim();
            if (content) {
                vscode.postMessage({
                    type: 'sendMessage',
                    content: content
                });
                messageInput.value = '';
                sendButton.disabled = true;
                setTimeout(() => {
                    sendButton.disabled = false;
                }, 1000);
            }
        }

        function clearChat() {
            vscode.postMessage({
                type: 'clearChat'
            });
        }

        sendButton.addEventListener('click', sendMessage);
        clearButton.addEventListener('click', clearChat);

        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });

        messageInput.addEventListener('input', () => {
            messageInput.style.height = 'auto';
            messageInput.style.height = Math.min(messageInput.scrollHeight, 100) + 'px';
        });

        messages.scrollTo(0, messages.scrollHeight);
    </script>
</body>
</html>`;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}

export function activate(context: vscode.ExtensionContext) {
  const api = new BackendAPI();
  const chatPanel = new ChatPanel(api, context);

  const openChat = vscode.commands.registerCommand('mlCodeReview.openChat', () => {
    chatPanel.show();
  });

  const analyzeNotebook = vscode.commands.registerCommand('mlCodeReview.analyzeNotebook', async (uri: vscode.Uri) => {
    if (!uri) {
      const activeEditor = vscode.window.activeTextEditor;
      if (!activeEditor) {
        vscode.window.showErrorMessage('No notebook file selected');
        return;
      }
      uri = activeEditor.document.uri;
    }

    const filePath = uri.fsPath;
    if (!filePath.endsWith('.ipynb')) {
      vscode.window.showErrorMessage('Please select a Jupyter notebook file (.ipynb)');
      return;
    }

    const notebook = NotebookReader.readNotebook(filePath);
    if (!notebook) {
      vscode.window.showErrorMessage('Failed to read notebook file');
      return;
    }

    const codeCells = NotebookReader.extractCodeCells(notebook);
    const combinedCode = codeCells.join('\n\n');

    vscode.window.showInformationMessage(`Found ${codeCells.length} code cells`);
    
    try {
      const analysis = await api.analyzeCode(combinedCode);
      
      const panel = vscode.window.createWebviewPanel(
        'mlCodeReview',
        'ML Code Review Results',
        vscode.ViewColumn.Two,
        { enableScripts: true }
      );

      panel.webview.html = getWebviewContent(analysis, codeCells.length);
    } catch (error) {
      vscode.window.showErrorMessage(`Analysis failed: ${error}`);
    }
  });

  const uploadImage = vscode.commands.registerCommand('mlCodeReview.uploadImage', async () => {
    const options: vscode.OpenDialogOptions = {
      canSelectMany: false,
      openLabel: 'Select Image',
      filters: {
        'Images': ['png', 'jpg', 'jpeg', 'gif', 'bmp']
      }
    };

    const fileUri = await vscode.window.showOpenDialog(options);
    if (fileUri && fileUri[0]) {
      const imagePath = fileUri[0].fsPath;
      const imageData = fs.readFileSync(imagePath, 'base64');
      
      vscode.window.showInformationMessage(`Image loaded: ${path.basename(imagePath)}`);
      
      context.globalState.update('selectedImage', imageData);
      context.globalState.update('selectedImagePath', imagePath);
    }
  });

  context.subscriptions.push(openChat, analyzeNotebook, uploadImage);
}

function getWebviewContent(analysis: any, cellCount: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ML Code Review Results</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            padding: 20px;
            line-height: 1.6;
        }
        .header { 
            background: #f0f0f0; 
            padding: 15px; 
            border-radius: 8px; 
            margin-bottom: 20px;
        }
        .analysis { 
            background: #fff; 
            border: 1px solid #ddd; 
            padding: 15px; 
            border-radius: 8px;
        }
        .code-count {
            color: #666;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>ML Code Review Results</h1>
        <p class="code-count">Analyzed ${cellCount} code cells</p>
    </div>
    <div class="analysis">
        <h2>Analysis Results</h2>
        <pre>${JSON.stringify(analysis, null, 2)}</pre>
    </div>
</body>
</html>`;
}

export function deactivate() {}