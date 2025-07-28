import * as vscode from 'vscode';
import { ChatMessage } from '../types';
import { NotebookAnalyzer } from './notebookAnalyzer';

export class WebviewProvider {
  private panel: vscode.WebviewPanel | undefined;
  private notebookAnalyzer: NotebookAnalyzer;

  constructor(notebookAnalyzer: NotebookAnalyzer) {
    this.notebookAnalyzer = notebookAnalyzer;
  }

  public show(): void {
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

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });
  }

  public getPanel(): vscode.WebviewPanel | undefined {
    return this.panel;
  }

  public updateWebview(messages: ChatMessage[]): void {
    if (this.panel) {
      this.panel.webview.html = this.getChatWebviewContent(messages);
    }
  }

  public updateNotebookConnectionDisplay(): void {
    if (!this.panel) return;
    
    this.panel.webview.postMessage({
      type: 'updateNotebookConnection',
      data: this.notebookAnalyzer.getNotebookConnectionInfo()
    });
  }

  private getChatWebviewContent(messages: ChatMessage[]): string {
    const messagesHtml = messages.map(msg => `
      <div class="message ${msg.role}">
        <div class="message-avatar">${msg.role === 'user' ? 'U' : 'AI'}</div>
        <div class="message-content">${this.escapeHtml(msg.content)}</div>
      </div>
    `).join('');

    const notebookInfo = this.notebookAnalyzer.getNotebookConnectionInfo();

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
            align-items: flex-start;
            flex-wrap: wrap;
            gap: 10px;
        }
        .header-main {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .chat-header h1 {
            margin: 0;
            font-size: 20px;
        }
        .notebook-connection {
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            padding: 8px 12px;
            font-size: 12px;
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 20px;
        }
        .notebook-connection.connected {
            background: rgba(0, 255, 0, 0.1);
            border-color: rgba(0, 255, 0, 0.3);
        }
        .notebook-connection.disconnected {
            background: rgba(255, 255, 0, 0.1);
            border-color: rgba(255, 255, 0, 0.3);
        }
        .connection-status {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #666;
        }
        .connection-status.connected {
            background: #00ff00;
            box-shadow: 0 0 4px rgba(0, 255, 0, 0.6);
        }
        .connection-status.disconnected {
            background: #ffaa00;
            box-shadow: 0 0 4px rgba(255, 170, 0, 0.6);
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
        .upload-panel {
            padding: 20px 0;
        }
        .upload-buttons {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        .upload-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 2px dashed var(--vscode-button-background);
            border-radius: 12px;
            padding: 24px 16px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            text-align: center;
            transition: all 0.2s ease;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .upload-btn:hover {
            background: var(--vscode-button-hoverBackground);
            border-color: var(--vscode-button-hoverBackground);
            transform: translateY(-2px);
        }
        .upload-btn small {
            font-size: 11px;
            opacity: 0.8;
            font-weight: normal;
        }
        .upload-info {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 8px;
            padding: 16px;
        }
        .upload-info p {
            margin: 0 0 12px 0;
            color: var(--vscode-textLink-foreground);
        }
        .upload-info ul {
            margin: 0;
            padding-left: 20px;
        }
        .upload-info li {
            margin-bottom: 4px;
            font-size: 13px;
            line-height: 1.4;
        }
        .notebook-panel {
            padding: 20px 0;
        }
        .notebook-status {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 20px;
        }
        .notebook-status h3 {
            margin: 0 0 8px 0;
            color: var(--vscode-textLink-foreground);
        }
        .notebook-actions {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 12px;
            margin-bottom: 20px;
        }
        .notebook-actions .action-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: 1px solid var(--vscode-button-background);
            border-radius: 8px;
            padding: 12px 16px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            text-align: left;
            transition: all 0.2s ease;
        }
        .notebook-actions .action-btn:hover {
            background: var(--vscode-button-hoverBackground);
            border-color: var(--vscode-button-hoverBackground);
            transform: translateY(-1px);
        }
        .notebook-info {
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 8px;
            padding: 16px;
        }
        .notebook-info p {
            margin: 0 0 12px 0;
            color: var(--vscode-textLink-foreground);
        }
        .notebook-info ul {
            margin: 0;
            padding-left: 20px;
        }
        .notebook-info li {
            margin-bottom: 6px;
            font-size: 13px;
            line-height: 1.4;
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
            <div class="header-main">
                <h1>🤖 ML Code Review Assistant</h1>
                <div class="notebook-connection" id="notebookConnection">
                    ${notebookInfo.html}
                </div>
            </div>
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
                <button type="button" class="tab-btn" id="uploadTab">📁 Upload Files</button>
                <button type="button" class="tab-btn" id="notebookTab">📊 Live Notebook</button>
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
            <div class="upload-panel hidden" id="uploadPanel">
                <div class="upload-buttons">
                    <button type="button" class="upload-btn" id="uploadFileBtn">
                        📄 Upload File
                        <small>(.py, .ipynb, .txt, etc.)</small>
                    </button>
                    <button type="button" class="upload-btn" id="uploadImageBtn">
                        🖼️ Upload Image
                        <small>(.png, .jpg, .gif, etc.)</small>
                    </button>
                    <button type="button" class="upload-btn" id="uploadNotebookBtn">
                        📓 Upload Notebook
                        <small>(.ipynb files)</small>
                    </button>
                </div>
                <div class="upload-info">
                    <p>💡 <strong>Upload any file type:</strong></p>
                    <ul>
                        <li><strong>Code Files:</strong> .py, .js, .java, .cpp, .r</li>
                        <li><strong>Notebooks:</strong> .ipynb files for analysis</li>
                        <li><strong>Images:</strong> Screenshots, plots, diagrams</li>
                        <li><strong>Documents:</strong> .txt, .md, .csv</li>
                    </ul>
                </div>
            </div>
            <div class="notebook-panel hidden" id="notebookPanel">
                <div class="notebook-status" id="notebookStatus">
                    <h3>📊 Live Notebook Monitor</h3>
                    <p>Open a Jupyter notebook to see live analysis</p>
                </div>
                <div class="notebook-actions">
                    <button type="button" class="action-btn" id="analyzeNotebookBtn">
                        📊 Analyze Active Notebook
                    </button>
                    <button type="button" class="action-btn" id="getStatusBtn">
                        📈 Get Status
                    </button>
                    <button type="button" class="action-btn" id="showVariablesBtn">
                        🔢 Show Variables
                    </button>
                    <button type="button" class="action-btn" id="getLiveVariablesBtn">
                        🔴 Get Live Variables
                    </button>
                    <button type="button" class="action-btn" id="showPlotsBtn">
                        📊 Show Plots
                    </button>
                </div>
                <div class="notebook-info">
                    <p>💡 <strong>Live Monitoring Features:</strong></p>
                    <ul>
                        <li><strong>Real-time Updates:</strong> Automatically detects cell execution</li>
                        <li><strong>Error Detection:</strong> Alerts when errors occur</li>
                        <li><strong>Variable Tracking:</strong> Monitors variable assignments</li>
                        <li><strong>Live Variables:</strong> Gets current variable values from kernel</li>
                        <li><strong>Plot Detection:</strong> Identifies generated visualizations</li>
                        <li><strong>AI Analysis:</strong> Gets insights on notebook state</li>
                    </ul>
                </div>
            </div>
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
        const uploadTab = document.getElementById('uploadTab');
        const uploadPanel = document.getElementById('uploadPanel');
        const uploadFileBtn = document.getElementById('uploadFileBtn');
        const uploadImageBtn = document.getElementById('uploadImageBtn');
        const uploadNotebookBtn = document.getElementById('uploadNotebookBtn');
        const notebookTab = document.getElementById('notebookTab');
        const notebookPanel = document.getElementById('notebookPanel');
        const analyzeNotebookBtn = document.getElementById('analyzeNotebookBtn');
        const getStatusBtn = document.getElementById('getStatusBtn');
        const showVariablesBtn = document.getElementById('showVariablesBtn');
        const getLiveVariablesBtn = document.getElementById('getLiveVariablesBtn');
        const showPlotsBtn = document.getElementById('showPlotsBtn');

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
            uploadTab.classList.remove('active');
            notebookTab.classList.remove('active');
            chatForm.classList.remove('hidden');
            codeForm.classList.add('hidden');
            uploadPanel.classList.add('hidden');
            notebookPanel.classList.add('hidden');
            messageInput.focus();
        });
        
        codeTab.addEventListener('click', function() {
            codeTab.classList.add('active');
            chatTab.classList.remove('active');
            uploadTab.classList.remove('active');
            notebookTab.classList.remove('active');
            codeForm.classList.remove('hidden');
            chatForm.classList.add('hidden');
            uploadPanel.classList.add('hidden');
            notebookPanel.classList.add('hidden');
            codeInput.focus();
        });
        
        uploadTab.addEventListener('click', function() {
            uploadTab.classList.add('active');
            chatTab.classList.remove('active');
            codeTab.classList.remove('active');
            notebookTab.classList.remove('active');
            uploadPanel.classList.remove('hidden');
            chatForm.classList.add('hidden');
            codeForm.classList.add('hidden');
            notebookPanel.classList.add('hidden');
        });
        
        notebookTab.addEventListener('click', function() {
            notebookTab.classList.add('active');
            chatTab.classList.remove('active');
            codeTab.classList.remove('active');
            uploadTab.classList.remove('active');
            notebookPanel.classList.remove('hidden');
            chatForm.classList.add('hidden');
            codeForm.classList.add('hidden');
            uploadPanel.classList.add('hidden');
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
        
        // Upload button handlers
        uploadFileBtn.addEventListener('click', function() {
            vscode.postMessage({
                type: 'uploadFile'
            });
        });
        
        uploadImageBtn.addEventListener('click', function() {
            vscode.postMessage({
                type: 'uploadImage'
            });
        });
        
        uploadNotebookBtn.addEventListener('click', function() {
            vscode.postMessage({
                type: 'uploadNotebook'
            });
        });
        
        // Notebook button handlers
        analyzeNotebookBtn.addEventListener('click', function() {
            vscode.postMessage({
                type: 'analyzeActiveNotebook'
            });
        });
        
        getStatusBtn.addEventListener('click', function() {
            vscode.postMessage({
                type: 'getNotebookStatus'
            });
        });
        
        showVariablesBtn.addEventListener('click', function() {
            vscode.postMessage({
                type: 'showVariables'
            });
        });
        
        getLiveVariablesBtn.addEventListener('click', function() {
            vscode.postMessage({
                type: 'getLiveVariables'
            });
        });
        
        showPlotsBtn.addEventListener('click', function() {
            vscode.postMessage({
                type: 'showPlots'
            });
        });
        
        // Listen for notebook connection updates
        window.addEventListener('message', function(event) {
            const message = event.data;
            if (message.type === 'updateNotebookConnection') {
                const connectionElement = document.getElementById('notebookConnection');
                if (connectionElement) {
                    connectionElement.innerHTML = message.data.html;
                    connectionElement.className = 'notebook-connection ' + (message.data.connected ? 'connected' : 'disconnected');
                }
            }
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

  public dispose(): void {
    if (this.panel) {
      this.panel.dispose();
    }
  }
}