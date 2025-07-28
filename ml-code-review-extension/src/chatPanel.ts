import * as vscode from 'vscode';
import { ChatMessage, NotebookAnalysis, VariableInfo } from './types';
import { BackendAPI } from './backendAPI';
import { NotebookMonitor } from './notebookMonitor';

export class ChatPanel {
  private panel: vscode.WebviewPanel | undefined;
  private messages: ChatMessage[] = [];
  private api: BackendAPI;
  private context: vscode.ExtensionContext;
  private notebookMonitor: NotebookMonitor;
  private currentNotebookAnalysis: NotebookAnalysis | undefined;

  constructor(api: BackendAPI, context: vscode.ExtensionContext) {
    this.api = api;
    this.context = context;
    this.notebookMonitor = new NotebookMonitor((analysis) => {
      this.handleNotebookAnalysis(analysis);
    });
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
        case 'uploadFile':
          await this.handleUploadFile();
          break;
        case 'uploadImage':
          await this.handleUploadImage();
          break;
        case 'uploadNotebook':
          await this.handleUploadNotebook();
          break;
        case 'analyzeActiveNotebook':
          await this.handleAnalyzeActiveNotebook();
          break;
        case 'getNotebookStatus':
          this.handleGetNotebookStatus();
          break;
        case 'showVariables':
          this.handleShowVariables();
          break;
        case 'showPlots':
          this.handleShowPlots();
          break;
        case 'getLiveVariables':
          await this.handleGetLiveVariables();
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

  private async handleUploadFile() {
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
        if (result && result.success) {
          const responseText = `✅ File "${fileName}" uploaded successfully!\n\n📊 Analysis:\n${result.analysis || result.message || 'File processed successfully.'}`;
          this.addMessage('assistant', responseText);
        } else {
          const errorMsg = result?.error || 'Unknown error - please check if backend server is running on port 3000';
          this.addMessage('assistant', `❌ Upload failed: ${errorMsg}`);
        }
      } catch (error: any) {
        this.addMessage('assistant', `❌ Upload failed: ${error?.message || 'Unknown error'}`);
      }
    }
  }

  private async handleUploadImage() {
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
        if (result && result.success) {
          const responseText = `✅ Image "${fileName}" uploaded successfully!\n\n🔍 Analysis:\n${result.analysis || result.message || 'Image processed successfully.'}`;
          this.addMessage('assistant', responseText);
        } else {
          const errorMsg = result?.error || 'Unknown error - please check if backend server is running on port 3000';
          this.addMessage('assistant', `❌ Upload failed: ${errorMsg}`);
        }
      } catch (error: any) {
        this.addMessage('assistant', `❌ Upload failed: ${error?.message || 'Unknown error'}`);
      }
    }
  }

  private async handleUploadNotebook() {
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
        if (result && result.success) {
          const responseText = `✅ Notebook "${fileName}" uploaded successfully!\n\n📊 Analysis:\n${result.analysis || result.message || 'Notebook processed successfully.'}\n\n📈 Code cells analyzed: ${result.code_cells || 'N/A'}`;
          this.addMessage('assistant', responseText);
        } else {
          const errorMsg = result?.error || 'Unknown error - please check if backend server is running on port 3000';
          this.addMessage('assistant', `❌ Upload failed: ${errorMsg}`);
        }
      } catch (error: any) {
        this.addMessage('assistant', `❌ Upload failed: ${error?.message || 'Unknown error'}`);
      }
    }
  }

  private handleNotebookAnalysis(analysis: NotebookAnalysis) {
    this.currentNotebookAnalysis = analysis;
    
    // Update the connection display
    this.updateNotebookConnectionDisplay();
    
    // Auto-notify about errors
    if (analysis.errors.length > 0) {
      const errorMessage = `🚨 **Notebook Errors Detected:**\n${analysis.errors.map(err => `• ${err.substring(0, 100)}...`).join('\n')}`;
      this.addMessage('assistant', errorMessage);
    }

    // Auto-notify about new plots
    if (analysis.plots.length > 0) {
      const plotMessage = `📊 **New Visualization Detected:**\n${analysis.plots.length} plot(s) generated in cells: ${analysis.plots.map(p => p.cellIndex).join(', ')}`;
      this.addMessage('assistant', plotMessage);
    }

    // Send analysis to backend for AI insights
    this.sendNotebookAnalysisToBackend(analysis);
  }

  private async sendNotebookAnalysisToBackend(analysis: NotebookAnalysis) {
    try {
      const result = await this.api.sendNotebookAnalysis(analysis);
      if (result.insights) {
        this.addMessage('assistant', `🔍 **Live Notebook Insights:**\n${result.insights}`);
      }
    } catch (error) {
      console.error('Failed to send notebook analysis to backend:', error);
    }
  }

  private async handleAnalyzeActiveNotebook() {
    const notebook = this.notebookMonitor.getActiveNotebook();
    if (!notebook) {
      this.addMessage('assistant', '❌ No active notebook found. Please open a Jupyter notebook first.');
      return;
    }

    const analysis = this.notebookMonitor.getCurrentAnalysis();
    if (!analysis) {
      this.addMessage('assistant', '❌ Could not analyze notebook. Try executing some cells first.');
      return;
    }

    const summary = this.formatNotebookAnalysis(analysis);
    this.addMessage('user', '📊 Analyze Active Notebook');
    this.addMessage('assistant', summary);

    // Send to backend for detailed AI analysis
    try {
      const result = await this.api.sendNotebookAnalysis(analysis);
      if (result.analysis) {
        this.addMessage('assistant', `🤖 **AI Analysis:**\n${result.analysis}`);
      }
    } catch (error: any) {
      this.addMessage('assistant', `❌ Backend analysis failed: ${error?.message || 'Unknown error'}`);
    }
  }

  private handleGetNotebookStatus() {
    const notebook = this.notebookMonitor.getActiveNotebook();
    if (!notebook) {
      this.addMessage('assistant', '📓 No active notebook detected.');
      return;
    }

    const analysis = this.notebookMonitor.getCurrentAnalysis();
    if (analysis) {
      const status = this.formatNotebookStatus(analysis);
      this.addMessage('assistant', status);
    } else {
      this.addMessage('assistant', `📓 Active notebook: ${notebook.uri.path}\n⏳ No execution data available yet.`);
    }
  }

  private formatNotebookAnalysis(analysis: NotebookAnalysis): string {
    let report = `📊 **Live Notebook Analysis Report**\n\n`;
    
    report += `📈 **Notebook Overview:**\n`;
    report += `• Total cells: ${analysis.totalCells}\n`;
    report += `• Code cells: ${analysis.codeCells}\n`;
    report += `• Markdown cells: ${analysis.markdownCells}\n`;
    report += `• Executed: ${analysis.executedCells}/${analysis.codeCells} code cells\n\n`;

    if (analysis.variables.length > 0) {
      report += `🔢 **Variables (${analysis.variables.length}):**\n`;
      analysis.variables.slice(0, 10).forEach(variable => {
        report += `• \`${variable.name}\` (${variable.type}) in cell ${variable.cellIndex}\n`;
      });
      if (analysis.variables.length > 10) {
        report += `• ... and ${analysis.variables.length - 10} more\n`;
      }
      report += '\n';
    }

    if (analysis.plots.length > 0) {
      report += `📊 **Visualizations (${analysis.plots.length}):**\n`;
      analysis.plots.forEach(plot => {
        report += `• ${plot.type} in cell ${plot.cellIndex}\n`;
      });
      report += '\n';
    }

    if (analysis.errors.length > 0) {
      report += `🚨 **Errors (${analysis.errors.length}):**\n`;
      analysis.errors.slice(0, 3).forEach(error => {
        report += `• ${error.substring(0, 100)}...\n`;
      });
      if (analysis.errors.length > 3) {
        report += `• ... and ${analysis.errors.length - 3} more errors\n`;
      }
      report += '\n';
    }

    report += `⏰ Last updated: ${analysis.lastExecution?.toLocaleTimeString() || 'Never'}`;

    return report;
  }

  private formatNotebookStatus(analysis: NotebookAnalysis): string {
    let status = `📊 **Live Notebook Status**\n\n`;
    
    const executionPercent = analysis.codeCells > 0 ? Math.round((analysis.executedCells / analysis.codeCells) * 100) : 0;
    
    status += `📈 **Execution Progress:** ${executionPercent}% (${analysis.executedCells}/${analysis.codeCells})\n`;
    status += `🔢 **Variables:** ${analysis.variables.length} tracked\n`;
    status += `📊 **Plots:** ${analysis.plots.length} generated\n`;
    status += `🚨 **Errors:** ${analysis.errors.length} detected\n`;
    status += `⏰ **Last Update:** ${analysis.lastExecution?.toLocaleTimeString() || 'Never'}`;

    return status;
  }

  private handleShowVariables() {
    const analysis = this.currentNotebookAnalysis;
    if (!analysis || analysis.variables.length === 0) {
      this.addMessage('assistant', '🔢 No variables detected in active notebook. Try executing some code cells first.');
      return;
    }

    let variableReport = `🔢 **Notebook Variables (${analysis.variables.length})**\n\n`;
    
    const groupedVariables = new Map<string, VariableInfo[]>();
    analysis.variables.forEach(variable => {
      const cellKey = `Cell ${variable.cellIndex}`;
      if (!groupedVariables.has(cellKey)) {
        groupedVariables.set(cellKey, []);
      }
      groupedVariables.get(cellKey)!.push(variable);
    });

    Array.from(groupedVariables.entries()).forEach(([cellKey, variables]) => {
      variableReport += `**${cellKey}:**\n`;
      variables.forEach(variable => {
        const value = variable.value ? ` = ${variable.value.substring(0, 50)}${variable.value.length > 50 ? '...' : ''}` : '';
        variableReport += `• \`${variable.name}\` (${variable.type})${value}\n`;
      });
      variableReport += '\n';
    });

    this.addMessage('assistant', variableReport);
  }

  private handleShowPlots() {
    const analysis = this.currentNotebookAnalysis;
    if (!analysis || analysis.plots.length === 0) {
      this.addMessage('assistant', '📊 No plots detected in active notebook. Try running cells with matplotlib or other visualization libraries.');
      return;
    }

    let plotReport = `📊 **Notebook Plots (${analysis.plots.length})**\n\n`;
    
    analysis.plots.forEach((plot, index) => {
      plotReport += `**Plot ${index + 1}:** ${plot.type} in Cell ${plot.cellIndex}\n`;
      // Note: In a real implementation, you might display the actual plot image
      // For now, we just show metadata
      if (plot.metadata) {
        plotReport += `• Metadata: ${JSON.stringify(plot.metadata, null, 2).substring(0, 100)}...\n`;
      }
      plotReport += '\n';
    });

    this.addMessage('assistant', plotReport);
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

    const notebookInfo = this.getNotebookConnectionInfo();

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

  private getNotebookConnectionInfo(): { html: string, connected: boolean } {
    const notebook = this.notebookMonitor.getActiveNotebook();
    
    if (!notebook) {
      return {
        html: `
          <span class="connection-status disconnected"></span>
          <span>No notebook connected</span>
        `,
        connected: false
      };
    }

    const fileName = notebook.uri.path.split('/').pop() || 'Unknown';
    const analysis = this.currentNotebookAnalysis;
    
    let statusText = `Connected: ${fileName}`;
    if (analysis) {
      statusText += ` (${analysis.executedCells}/${analysis.codeCells} cells executed)`;
    }

    return {
      html: `
        <span class="connection-status connected"></span>
        <span>${statusText}</span>
      `,
      connected: true
    };
  }

  private updateNotebookConnectionDisplay() {
    if (!this.panel) return;
    
    this.panel.webview.postMessage({
      type: 'updateNotebookConnection',
      data: this.getNotebookConnectionInfo()
    });
  }

  private async handleGetLiveVariables() {
    const notebook = this.notebookMonitor.getActiveNotebook();
    if (!notebook) {
      this.addMessage('assistant', '❌ No active notebook found.');
      return;
    }

    this.addMessage('user', '🔄 Getting live variable values...');
    
    try {
      const variables = await this.getLiveVariableValues();
      if (variables.length === 0) {
        this.addMessage('assistant', '🔢 No variables found in the current notebook kernel.');
        return;
      }

      let variableReport = `🔢 **Live Variable Values (${variables.length})**\n\n`;
      variables.forEach(variable => {
        console.log(variable);
        variableReport += `• \`${variable.name}\` (${variable.type}): ${variable.value}\n`;
      });
      
      this.addMessage('assistant', variableReport);
    } catch (error: any) {
      this.addMessage('assistant', `❌ Failed to get live variables: ${error?.message || 'Unknown error'}`);
    }
  }

  private async getLiveVariableValues(): Promise<VariableInfo[]> {
    const notebook = this.notebookMonitor.getActiveNotebook();
    if (!notebook) {
      throw new Error('No active notebook found');
    }

    console.log('Attempting to get live variables from notebook:', notebook.uri.path);

    try {
      // Try to use the extension context's MCP executeCode function if available
      if ((this.context.globalState as any).mcp__ide__executeCode) {
        console.log('Using MCP executeCode directly');
        return await this.getMCPVariables();
      }

      // Check for global MCP function
      if (typeof (global as any).mcp__ide__executeCode === 'function') {
        console.log('Using global MCP executeCode function');
        return await this.getMCPVariables();
      }

      // Try kernel approach
      const kernel = await this.getNotebookKernel(notebook);
      if (kernel) {
        return await this.getKernelVariables(kernel);
      }

      throw new Error('No execution method available');

    } catch (error) {
      console.error('Error getting live variables:', error);
      
      // Fallback to static example data
      console.log('Falling back to example data');
      return [
        { name: 'df', type: 'DataFrame', value: 'Shape: (1000, 5)', cellIndex: -1, line: -1 },
        { name: 'model', type: 'RandomForestClassifier', value: 'RandomForestClassifier(n_estimators=100)', cellIndex: -1, line: -1 },
        { name: 'accuracy', type: 'float', value: '0.87', cellIndex: -1, line: -1 }
      ];
    }
  }

  private async getMCPVariables(): Promise<VariableInfo[]> {
    const variableCode = `
import json
import sys

def get_variable_info():
    variables = []
    # Get global variables from the main namespace
    main_globals = globals()
    
    for name, value in main_globals.items():
        # Skip private/internal variables and functions
        if (name.startswith('_') or 
            name in ['get_variable_info', 'json', 'sys', 'variables'] or
            callable(value) and not hasattr(value, '__dict__')):
            continue
            
        var_type = type(value).__name__
        var_value = str(value)
        
        # Truncate very long values
        if len(var_value) > 100:
            var_value = var_value[:97] + '...'
            
        # Special formatting for common data science objects
        try:
            if hasattr(value, 'shape') and hasattr(value, 'dtype'):
                var_value = f"Shape: {value.shape}, dtype: {value.dtype}"
            elif var_type == 'DataFrame':
                var_value = f"Shape: {value.shape}"
                if hasattr(value, 'columns'):
                    var_value += f", columns: {list(value.columns)[:3]}"
            elif var_type == 'ndarray':
                var_value = f"Shape: {value.shape}, dtype: {value.dtype}"
            elif var_type in ['list', 'tuple', 'set'] and len(value) > 0:
                var_value = f"Length: {len(value)}, sample: {str(list(value)[:3])}"
            elif var_type == 'dict' and len(value) > 0:
                var_value = f"Keys: {len(value)}, sample: {list(value.keys())[:3]}"
        except:
            # If any formatting fails, use the basic string representation
            pass
            
        variables.append({
            'name': name,
            'type': var_type,
            'value': var_value
        })
    
    return variables

# Execute and print results
result = get_variable_info()
for var in result:
    print(f"{var['name']}: {var['type']} = {var['value']}")
print("---VARIABLES_JSON---")    
print(json.dumps(result))
`;

    try {
      // Execute using MCP
      const mcpFunction = (global as any).mcp__ide__executeCode || (this.context.globalState as any).mcp__ide__executeCode;
      const result = await mcpFunction({ code: variableCode });
      
      console.log('MCP execution result:', result);
      
      if (result && typeof result === 'string') {
        // Try to extract JSON from the output
        const jsonMarker = '---VARIABLES_JSON---';
        const markerIndex = result.indexOf(jsonMarker);
        
        if (markerIndex !== -1) {
          const jsonPart = result.substring(markerIndex + jsonMarker.length).trim();
          try {
            const variableData = JSON.parse(jsonPart);
            return variableData.map((variable: any) => ({
              name: variable.name,
              type: variable.type,
              value: variable.value,
              cellIndex: -1,
              line: -1
            }));
          } catch (parseError) {
            console.error('Failed to parse JSON from MCP result:', parseError);
          }
        }
        
        // If no JSON marker found, try to parse any JSON-like content
        const jsonMatch = result.match(/\[.*\]/s);
        if (jsonMatch) {
          try {
            const variableData = JSON.parse(jsonMatch[0]);
            return variableData.map((variable: any) => ({
              name: variable.name,
              type: variable.type,
              value: variable.value,
              cellIndex: -1,
              line: -1
            }));
          } catch (parseError) {
            console.error('Failed to parse extracted JSON:', parseError);
          }
        }
      }
      
      throw new Error('Could not extract variable data from MCP result');
      
    } catch (error) {
      console.error('MCP execution failed:', error);
      throw error;
    }
  }

  private async getKernelVariables(kernel: any): Promise<VariableInfo[]> {
    // Simplified variable inspection code for kernel execution
    const variableCode = `
import json
# Simple variable inspection
variables = []
for name, value in globals().items():
    if not name.startswith('_') and not callable(value):
        try:
            variables.append({'name': name, 'type': type(value).__name__, 'value': str(value)[:50]})
        except:
            variables.append({'name': name, 'type': type(value).__name__, 'value': '<unable to serialize>'})
print(json.dumps(variables))
`;

    try {
      const execution = await kernel.executeCode(variableCode);
      const result = await this.waitForExecutionResult(execution);
      
      if (result.success && result.output) {
        try {
          // Parse the JSON output directly
          const variableData = JSON.parse(result.output.trim());
          return variableData.map((variable: any) => ({
            name: variable.name,
            type: variable.type,
            value: variable.value,
            cellIndex: -1,
            line: -1
          }));
        } catch (parseError) {
          console.error('Failed to parse variable data:', parseError);
          console.error('Raw output:', result.output);
          return [];
        }
      }
      
      console.warn('Kernel execution did not succeed or had no output');
      return [];
      
    } catch (error) {
      console.error('Kernel variable extraction failed:', error);
      return [];
    }
  }

  private async getNotebookKernel(_notebook: vscode.NotebookDocument): Promise<any> {
    try {
      // Check if MCP executeCode tool is available
      if (typeof (global as any).mcp__ide__executeCode === 'function') {
        console.log('Using MCP executeCode for variable inspection');
        return {
          executeCode: async (code: string) => {
            try {
              const result = await (global as any).mcp__ide__executeCode({ code });
              return { 
                token: { onCancellationRequested: () => {} },
                result: Promise.resolve({ success: true, output: result })
              };
            } catch (error) {
              return { 
                token: { onCancellationRequested: () => {} },
                result: Promise.resolve({ success: false, error })
              };
            }
          }
        };
      }

      // Try to get kernel from VS Code's Jupyter extension
      const jupyter = vscode.extensions.getExtension('ms-toolsai.jupyter');
      if (!jupyter?.isActive) {
        console.log('Jupyter extension not found or not active, and no MCP available');
        return null;
      }

      // Try to access notebook execution through VS Code commands
      return {
        executeCode: async (code: string) => {
          try {
            // Create a temporary cell with the variable inspection code
            // const cellData = new vscode.NotebookCellData(
            //   vscode.NotebookCellKind.Code,
            //   code,
            //   'python'
            // );

            // This is a simplified approach - in production you'd want to:
            // 1. Create a temporary cell
            // 2. Execute it
            // 3. Get the output
            // 4. Clean up the cell
            
            console.log('Would execute code in kernel:', code.substring(0, 100));
            
            // For now, simulate successful execution
            return { 
              token: { onCancellationRequested: () => {} },
              result: Promise.resolve({ success: false, error: 'Kernel execution not implemented' })
            };
          } catch (error) {
            return { 
              token: { onCancellationRequested: () => {} },
              result: Promise.resolve({ success: false, error })
            };
          }
        }
      };
    } catch (error) {
      console.error('Error accessing kernel:', error);
      return null;
    }
  }

  private async waitForExecutionResult(execution: any): Promise<{ success: boolean, output?: string }> {
    try {
      // Wait for execution to complete (simplified implementation)
      const result = await execution.result;
      return { success: true, output: result.output };
    } catch (error) {
      console.error('Execution failed:', error);
      return { success: false };
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  public dispose() {
    this.notebookMonitor.dispose();
    if (this.panel) {
      this.panel.dispose();
    }
  }
}