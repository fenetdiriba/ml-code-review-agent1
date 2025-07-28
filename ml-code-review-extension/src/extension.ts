import * as vscode from 'vscode';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

class BackendAPI {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:8000') {
    this.baseUrl = baseUrl;
  }

  async sendChatMessage(message: string): Promise<any> {
    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      const parsedUrl = url.parse(`${this.baseUrl}/chat`);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const postData = JSON.stringify({
        message
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
              if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                return;
              }
              const parsed = JSON.parse(data);
              resolve(parsed);
            } catch (e) {
              reject(new Error(`Failed to parse response: ${data}`));
            }
          });
        });

        req.on('error', (err: any) => {
          console.error('HTTP request error:', err);
          reject(err);
        });
        
        req.setTimeout(10000, () => {
          req.destroy();
          reject(new Error('Request timeout - backend may be slow or unavailable'));
        });
        
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
      { enableScripts: true }
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

    this.updateWebview();
  }

  private clearMessages() {
    this.messages = [];
    this.updateWebview();
  }


  private addMessage(role: 'user' | 'assistant', content: string) {
    const message: ChatMessage = {
      id: Date.now().toString(),
      role,
      content,
      timestamp: new Date()
    };
    this.messages.push(message);
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
        <div class="message-avatar">${msg.role === 'user' ? 'U' : 'AI'}</div>
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
            padding: 20px;
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .chat-container {
            max-width: 800px;
            margin: 0 auto;
            background: var(--vscode-panel-background);
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            display: flex;
            flex-direction: column;
            height: calc(100vh - 40px);
        }
        .chat-header {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            padding: 20px;
            border-radius: 8px 8px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 10px;
        }
        .chat-header h1 {
            margin: 0;
            font-size: 20px;
            flex: 1;
        }
        .header-buttons {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .action-btn {
            background: var(--vscode-textLink-foreground);
            border: none;
            color: white;
            padding: 8px 12px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 500;
            transition: all 0.2s ease;
        }
        .action-btn:hover {
            background: var(--vscode-textLink-activeForeground);
            transform: translateY(-1px);
        }
        .clear-btn {
            background: rgba(255,255,255,0.2);
            border: none;
            color: var(--vscode-button-foreground);
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }
        .clear-btn:hover {
            background: rgba(255,255,255,0.3);
        }
        .chat-messages {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 16px;
        }
        .message {
            display: flex;
            gap: 12px;
            animation: fadeIn 0.3s ease-in;
        }
        .message.user {
            flex-direction: row-reverse;
        }
        .message-avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            font-size: 14px;
            flex-shrink: 0;
        }
        .message.user .message-avatar {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .message.assistant .message-avatar {
            background: var(--vscode-textLink-foreground);
            color: white;
        }
        .message-content {
            background: var(--vscode-input-background);
            padding: 12px 16px;
            border-radius: 12px;
            max-width: 70%;
            line-height: 1.5;
            border: 1px solid var(--vscode-input-border);
        }
        .message.user .message-content {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .message.assistant .message-content {
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        .chat-input {
            padding: 20px;
            border-top: 1px solid var(--vscode-input-border);
            background: var(--vscode-panel-background);
            border-radius: 0 0 8px 8px;
        }
        .input-tabs {
            display: flex;
            gap: 4px;
            margin-bottom: 12px;
        }
        .tab-btn {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            color: var(--vscode-input-foreground);
            padding: 8px 16px;
            border-radius: 6px 6px 0 0;
            cursor: pointer;
            font-size: 12px;
        }
        .tab-btn.active {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .chat-input-form, .code-input-form {
            display: flex;
            gap: 12px;
        }
        .code-input-form {
            flex-direction: column;
            gap: 12px;
        }
        .hidden {
            display: none !important;
        }
        .chat-input-field {
            flex: 1;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            padding: 12px 16px;
            color: var(--vscode-input-foreground);
            font-size: 14px;
            resize: none;
            min-height: 20px;
            max-height: 100px;
        }
        .chat-input-field:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .code-input-field {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 6px;
            padding: 12px 16px;
            color: var(--vscode-input-foreground);
            font-size: 14px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            resize: vertical;
            min-height: 120px;
        }
        .code-input-field:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .send-btn, .analyze-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 6px;
            padding: 12px 20px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
        }
        .send-btn:hover, .analyze-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }
        .analyze-btn {
            align-self: flex-end;
            min-width: 120px;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(10px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h1>🤖 ML Code Review Assistant</h1>
            <div class="header-buttons">
                <button class="clear-btn" id="clearBtn">Clear Chat</button>
            </div>
        </div>
        <div class="chat-messages" id="messages">
            ${messagesHtml}
        </div>
        <div class="chat-input">
            <div class="input-tabs">
                <button type="button" class="tab-btn active" id="chatTab">💬 Chat</button>
                <button type="button" class="tab-btn" id="codeTab">📝 Code Analysis</button>
            </div>
            <form class="chat-input-form" id="chatForm">
                <textarea 
                    class="chat-input-field" 
                    id="messageInput" 
                    placeholder="Ask about ML code, best practices, or request analysis..."
                    rows="1"
                ></textarea>
                <button type="submit" class="send-btn">Send</button>
            </form>
            <form class="code-input-form hidden" id="codeForm">
                <textarea 
                    class="code-input-field" 
                    id="codeInput" 
                    placeholder="Paste your ML code here for analysis..."
                    rows="8"
                ></textarea>
                <button type="submit" class="analyze-btn">Analyze Code</button>
            </form>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const messagesContainer = document.getElementById('messages');
        const messageInput = document.getElementById('messageInput');
        const chatForm = document.getElementById('chatForm');
        const clearButton = document.getElementById('clearBtn');
        const codeInput = document.getElementById('codeInput');
        const codeForm = document.getElementById('codeForm');
        const chatTab = document.getElementById('chatTab');
        const codeTab = document.getElementById('codeTab');

        // Auto-resize textarea
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });

        // Handle form submission
        chatForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const message = messageInput.value.trim();
            if (!message) return;
            
            vscode.postMessage({
                type: 'sendMessage',
                content: message
            });
            
            messageInput.value = '';
            messageInput.style.height = 'auto';
        });

        function clearChat() {
            vscode.postMessage({
                type: 'clearChat'
            });
        }

        clearButton.addEventListener('click', clearChat);
        
        // Tab switching
        chatTab.addEventListener('click', function() {
            chatTab.classList.add('active');
            codeTab.classList.remove('active');
            chatForm.classList.remove('hidden');
            codeForm.classList.add('hidden');
            messageInput.focus();
        });
        
        codeTab.addEventListener('click', function() {
            codeTab.classList.add('active');
            chatTab.classList.remove('active');
            codeForm.classList.remove('hidden');
            chatForm.classList.add('hidden');
            codeInput.focus();
        });
        
        // Handle code analysis
        codeForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            const code = codeInput.value.trim();
            if (!code) return;
            
            const message = \`Please analyze this ML code:\\n\\n\\\`\\\`\\\`python\\n\${code}\\n\\\`\\\`\\\`\`;
            
            vscode.postMessage({
                type: 'sendMessage',
                content: message
            });
            
            codeInput.value = '';
            
            // Switch back to chat tab to see response
            chatTab.click();
        });
        
        // Focus on input
        messageInput.focus();
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
  console.log('🚀 ML Code Review extension is now activating!');
  vscode.window.showInformationMessage('ML Code Review extension activated!');
  
  const api = new BackendAPI();
  const chatPanel = new ChatPanel(api, context);

  const openChat = vscode.commands.registerCommand('mlCodeReview.openChat', () => {
    chatPanel.show();
  });

  context.subscriptions.push(openChat);
}


export function deactivate() {}