"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const fs = require("fs");
class BackendAPI {
    constructor(baseUrl = 'http://localhost:3000') {
        this.baseUrl = baseUrl;
    }
    async sendChatMessage(message) {
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
                }, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => {
                        try {
                            if (res.statusCode !== 200) {
                                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                                return;
                            }
                            const parsed = JSON.parse(data);
                            resolve(parsed);
                        }
                        catch (e) {
                            reject(new Error(`Failed to parse response: ${data}`));
                        }
                    });
                });
                req.on('error', (err) => {
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
        }
        catch (error) {
            console.error('Chat API error:', error);
            throw error;
        }
    }
    async uploadFile(filePath) {
        try {
            const https = require('https');
            const http = require('http');
            const url = require('url');
            const FormData = require('form-data');
            const parsedUrl = url.parse(`${this.baseUrl}/upload`);
            const client = parsedUrl.protocol === 'https:' ? https : http;
            const form = new FormData();
            form.append('file', fs.createReadStream(filePath));
            return new Promise((resolve, reject) => {
                const req = client.request({
                    hostname: parsedUrl.hostname,
                    port: parsedUrl.port,
                    path: parsedUrl.path,
                    method: 'POST',
                    headers: form.getHeaders()
                }, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => {
                        try {
                            if (res.statusCode !== 200) {
                                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                                return;
                            }
                            resolve(JSON.parse(data));
                        }
                        catch (e) {
                            reject(new Error(`Failed to parse response: ${data}`));
                        }
                    });
                });
                req.on('error', (err) => {
                    console.error('Upload request error:', err);
                    reject(err);
                });
                req.setTimeout(30000, () => {
                    req.destroy();
                    reject(new Error('Upload timeout - file may be too large'));
                });
                form.pipe(req);
            });
        }
        catch (error) {
            console.error('Upload API error:', error);
            throw error;
        }
    }
}
class ChatPanel {
    constructor(api, context) {
        this.messages = [];
        this.api = api;
        this.context = context;
    }
    show() {
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Two);
            return;
        }
        this.panel = vscode.window.createWebviewPanel('mlCodeReviewChat', 'ML Code Review Chat', vscode.ViewColumn.Two, { enableScripts: true });
        this.panel.webview.html = this.getChatWebviewContent();
        this.setupWebviewMessageHandling();
        this.panel.onDidDispose(() => {
            this.panel = undefined;
        });
    }
    setupWebviewMessageHandling() {
        if (!this.panel)
            return;
        this.panel.webview.onDidReceiveMessage(async (message) => {
            switch (message.type) {
                case 'sendMessage':
                    await this.handleUserMessage(message.content);
                    break;
                case 'clearChat':
                    this.clearMessages();
                    break;
                case 'uploadFile':
                    await this.handleUploadFile();
                    break;
                case 'uploadImage':
                    await this.handleUploadImage();
                    break;
                case 'uploadNotebook':
                    await this.handleUploadNotebook();
                    break;
            }
        });
    }
    async handleUserMessage(content) {
        const userMessage = {
            id: Date.now().toString(),
            role: 'user',
            content,
            timestamp: new Date()
        };
        this.messages.push(userMessage);
        this.updateWebview();
        try {
            const response = await this.api.sendChatMessage(content);
            const assistantMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: response.response || 'Sorry, I could not process your request.',
                timestamp: new Date()
            };
            this.messages.push(assistantMessage);
        }
        catch (error) {
            console.error('Chat error details:', error);
            let errorText = 'Sorry, I encountered an error. Please try again.';
            if (error?.code === 'ECONNREFUSED') {
                errorText = 'Cannot connect to backend server. Make sure app.py is running on port 8000.';
            }
            else if (error?.message) {
                errorText = `Error: ${error.message}`;
            }
            const errorMessage = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: errorText,
                timestamp: new Date()
            };
            this.messages.push(errorMessage);
        }
        this.updateWebview();
    }
    clearMessages() {
        this.messages = [];
        this.updateWebview();
    }
    addMessage(role, content) {
        const message = {
            id: Date.now().toString(),
            role,
            content,
            timestamp: new Date()
        };
        this.messages.push(message);
        this.updateWebview();
    }
    async handleUploadFile() {
        const options = {
            canSelectMany: false,
            openLabel: 'Select File',
            filters: {
                'All Files': ['*'],
                'Code Files': ['py', 'js', 'java', 'cpp', 'r', 'txt', 'md'],
                'Data Files': ['csv', 'json', 'xml'],
                'Documents': ['txt', 'md', 'pdf']
            }
        };
        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            const filePath = fileUri[0].fsPath;
            const fileName = require('path').basename(filePath);
            this.addMessage('user', `📄 Uploading file: ${fileName}`);
            try {
                const result = await this.api.uploadFile(filePath);
                if (result.success) {
                    const responseText = `✅ File "${fileName}" uploaded successfully!\n\n📊 Analysis:\n${result.analysis || 'File processed successfully.'}`;
                    this.addMessage('assistant', responseText);
                }
                else {
                    this.addMessage('assistant', `❌ Upload failed: ${result.error || 'Unknown error'}`);
                }
            }
            catch (error) {
                this.addMessage('assistant', `❌ Upload failed: ${error?.message || 'Unknown error'}`);
            }
        }
    }
    async handleUploadImage() {
        const options = {
            canSelectMany: false,
            openLabel: 'Select Image',
            filters: {
                'Images': ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'svg']
            }
        };
        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            const filePath = fileUri[0].fsPath;
            const fileName = require('path').basename(filePath);
            this.addMessage('user', `🖼️ Uploading image: ${fileName}`);
            try {
                const result = await this.api.uploadFile(filePath);
                if (result.success) {
                    const responseText = `✅ Image "${fileName}" uploaded successfully!\n\n🔍 Analysis:\n${result.analysis || 'Image processed successfully.'}`;
                    this.addMessage('assistant', responseText);
                }
                else {
                    this.addMessage('assistant', `❌ Upload failed: ${result.error || 'Unknown error'}`);
                }
            }
            catch (error) {
                this.addMessage('assistant', `❌ Upload failed: ${error?.message || 'Unknown error'}`);
            }
        }
    }
    async handleUploadNotebook() {
        const options = {
            canSelectMany: false,
            openLabel: 'Select Jupyter Notebook',
            filters: {
                'Jupyter Notebooks': ['ipynb']
            }
        };
        const fileUri = await vscode.window.showOpenDialog(options);
        if (fileUri && fileUri[0]) {
            const filePath = fileUri[0].fsPath;
            const fileName = require('path').basename(filePath);
            this.addMessage('user', `📓 Uploading notebook: ${fileName}`);
            try {
                const result = await this.api.uploadFile(filePath);
                if (result.success) {
                    const responseText = `✅ Notebook "${fileName}" uploaded successfully!\n\n📊 Analysis:\n${result.analysis || 'Notebook processed successfully.'}\n\n📈 Code cells analyzed: ${result.code_cells || 'N/A'}`;
                    this.addMessage('assistant', responseText);
                }
                else {
                    this.addMessage('assistant', `❌ Upload failed: ${result.error || 'Unknown error'}`);
                }
            }
            catch (error) {
                this.addMessage('assistant', `❌ Upload failed: ${error?.message || 'Unknown error'}`);
            }
        }
    }
    updateWebview() {
        if (this.panel) {
            this.panel.webview.html = this.getChatWebviewContent();
        }
    }
    getChatWebviewContent() {
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
                <button type="button" class="tab-btn" id="uploadTab">📁 Upload Files</button>
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
            chatForm.classList.remove('hidden');
            codeForm.classList.add('hidden');
            uploadPanel.classList.add('hidden');
            messageInput.focus();
        });
        
        codeTab.addEventListener('click', function() {
            codeTab.classList.add('active');
            chatTab.classList.remove('active');
            uploadTab.classList.remove('active');
            codeForm.classList.remove('hidden');
            chatForm.classList.add('hidden');
            uploadPanel.classList.add('hidden');
            codeInput.focus();
        });
        
        uploadTab.addEventListener('click', function() {
            uploadTab.classList.add('active');
            chatTab.classList.remove('active');
            codeTab.classList.remove('active');
            uploadPanel.classList.remove('hidden');
            chatForm.classList.add('hidden');
            codeForm.classList.add('hidden');
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
        
        // Focus on input
        messageInput.focus();
    </script>
</body>
</html>`;
    }
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
}
function activate(context) {
    console.log('🚀 ML Code Review extension is now activating!');
    vscode.window.showInformationMessage('ML Code Review extension activated!');
    const api = new BackendAPI();
    const chatPanel = new ChatPanel(api, context);
    const openChat = vscode.commands.registerCommand('mlCodeReview.openChat', () => {
        chatPanel.show();
    });
    context.subscriptions.push(openChat);
}
exports.activate = activate;
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map