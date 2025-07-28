import * as vscode from 'vscode';
import * as fs from 'fs';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface NotebookCellData {
  index: number;
  cellType: string;
  source: string;
  outputs: any[];
  executionCount?: number;
  executionSummary?: any;
  metadata: any;
}

interface NotebookAnalysis {
  totalCells: number;
  codeCells: number;
  markdownCells: number;
  executedCells: number;
  errors: string[];
  variables: VariableInfo[];
  plots: PlotInfo[];
  lastExecution?: Date;
}

interface VariableInfo {
  name: string;
  type: string;
  value?: string;
  cellIndex: number;
  line: number;
}

interface PlotInfo {
  cellIndex: number;
  type: string;
  data: string; // base64 image data
  metadata?: any;
}

class NotebookMonitor {
  private disposables: vscode.Disposable[] = [];
  private activeNotebook: vscode.NotebookDocument | undefined;
  private cellData: Map<string, NotebookCellData> = new Map();
  private onNotebookChange: ((analysis: NotebookAnalysis) => void) | undefined;

  constructor(onNotebookChange?: (analysis: NotebookAnalysis) => void) {
    this.onNotebookChange = onNotebookChange;
    this.setupNotebookListeners();
  }

  private setupNotebookListeners() {
    // Monitor active notebook changes
    this.disposables.push(
      vscode.window.onDidChangeActiveNotebookEditor((editor) => {
        if (editor?.notebook) {
          this.setActiveNotebook(editor.notebook);
        }
      })
    );

    // Monitor notebook document changes
    this.disposables.push(
      vscode.workspace.onDidChangeNotebookDocument((event) => {
        if (event.notebook === this.activeNotebook) {
          this.handleNotebookChange(event);
        }
      })
    );

    // Monitor cell execution (fallback to document changes for older VS Code versions)
    // Note: Cell execution monitoring may be limited in older VS Code versions

    // Set initial active notebook
    if (vscode.window.activeNotebookEditor?.notebook) {
      this.setActiveNotebook(vscode.window.activeNotebookEditor.notebook);
    }
  }

  private setActiveNotebook(notebook: vscode.NotebookDocument) {
    this.activeNotebook = notebook;
    this.cellData.clear();
    this.analyzeNotebook();
  }

  private handleNotebookChange(event: vscode.NotebookDocumentChangeEvent) {
    // Handle cell content changes
    for (const change of event.contentChanges) {
      for (const cell of change.addedCells || []) {
        this.updateCellData(cell);
      }
      for (const cell of change.removedCells || []) {
        this.cellData.delete(cell.document.uri.toString());
      }
    }
    
    // Handle cell output changes
    for (const change of event.cellChanges) {
      if (change.outputs) {
        this.updateCellData(change.cell);
      }
    }

    this.notifyChange();
  }

  // Note: Cell execution monitoring requires VS Code 1.74+ with specific API support
  // This method is kept for future compatibility but not currently used
  private handleCellExecution(cell: vscode.NotebookCell) {
    this.updateCellData(cell);
    this.analyzeCellOutputs(cell);
    this.notifyChange();
  }

  private updateCellData(cell: vscode.NotebookCell) {
    const cellId = cell.document.uri.toString();
    const index = cell.index;
    
    const cellData: NotebookCellData = {
      index,
      cellType: cell.kind === vscode.NotebookCellKind.Code ? 'code' : 'markdown',
      source: cell.document.getText(),
      outputs: cell.outputs.map(output => this.serializeOutput(output)),
      executionCount: cell.executionSummary?.executionOrder,
      executionSummary: cell.executionSummary,
      metadata: cell.metadata
    };

    this.cellData.set(cellId, cellData);
  }

  private serializeOutput(output: vscode.NotebookCellOutput): any {
    return {
      items: output.items.map(item => ({
        mime: item.mime,
        data: item.data.toString()
      })),
      metadata: output.metadata
    };
  }

  private analyzeCellOutputs(cell: vscode.NotebookCell) {
    // Extract errors, plots, and variable info from outputs
    for (const output of cell.outputs) {
      for (const item of output.items) {
        // Check for errors
        if (item.mime.includes('error') || item.mime.includes('traceback')) {
          console.log('Error detected in cell', cell.index, ':', item.data.toString());
        }
        
        // Check for plots
        if (item.mime.startsWith('image/')) {
          console.log('Plot detected in cell', cell.index);
        }
        
        // Check for variable outputs
        if (item.mime === 'text/plain' && cell.kind === vscode.NotebookCellKind.Code) {
          this.extractVariableInfo(cell, item.data.toString());
        }
      }
    }
  }

  private extractVariableInfo(cell: vscode.NotebookCell, output: string) {
    // Parse variable assignments from code
    const source = cell.document.getText();
    const variables = this.parseVariableAssignments(source, cell.index);
    
    // Try to match output with variables
    for (const variable of variables) {
      if (output.includes(variable.name)) {
        variable.value = this.extractVariableValue(output, variable.name);
      }
    }
  }

  private parseVariableAssignments(source: string, cellIndex: number): VariableInfo[] {
    const variables: VariableInfo[] = [];
    const lines = source.split('\n');
    
    lines.forEach((line, lineIndex) => {
      // Simple regex for variable assignments
      const assignmentPattern = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/;
      const match = line.match(assignmentPattern);
      
      if (match) {
        const [, name, assignment] = match;
        const type = this.inferVariableType(assignment);
        
        variables.push({
          name,
          type,
          cellIndex,
          line: lineIndex
        });
      }
    });
    
    return variables;
  }

  private inferVariableType(assignment: string): string {
    if (assignment.includes('pd.read_csv') || assignment.includes('DataFrame')) {
      return 'DataFrame';
    } else if (assignment.includes('np.array') || assignment.includes('array')) {
      return 'ndarray';
    } else if (assignment.includes('plt.') || assignment.includes('matplotlib')) {
      return 'plot';
    } else if (assignment.match(/^\d+$/)) {
      return 'int';
    } else if (assignment.match(/^\d+\.\d+$/)) {
      return 'float';
    } else if (assignment.startsWith('"') || assignment.startsWith("'")) {
      return 'str';
    } else if (assignment.startsWith('[')) {
      return 'list';
    } else if (assignment.startsWith('{')) {
      return 'dict';
    }
    return 'unknown';
  }

  private extractVariableValue(output: string, variableName: string): string {
    // Extract variable value from output text
    const lines = output.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(variableName)) {
        // Return next few lines as value
        return lines.slice(i, i + 3).join('\n').trim();
      }
    }
    return output.substring(0, 200); // First 200 chars
  }

  private analyzeNotebook(): NotebookAnalysis | undefined {
    if (!this.activeNotebook) return undefined;

    const cells = Array.from(this.cellData.values());
    const codeCells = cells.filter(cell => cell.cellType === 'code');
    const executedCells = codeCells.filter(cell => cell.executionCount !== undefined);
    
    const errors: string[] = [];
    const variables: VariableInfo[] = [];
    const plots: PlotInfo[] = [];

    // Extract errors, variables, and plots from all cells
    cells.forEach(cell => {
      // Extract errors
      cell.outputs.forEach(output => {
        output.items.forEach((item: any) => {
          if (item.mime.includes('error') || item.mime.includes('traceback')) {
            errors.push(`Cell ${cell.index}: ${item.data}`);
          }
          
          // Extract plots
          if (item.mime.startsWith('image/')) {
            plots.push({
              cellIndex: cell.index,
              type: item.mime,
              data: item.data,
              metadata: output.metadata
            });
          }
        });
      });

      // Extract variables from code cells
      if (cell.cellType === 'code') {
        const cellVariables = this.parseVariableAssignments(cell.source, cell.index);
        variables.push(...cellVariables);
      }
    });

    return {
      totalCells: this.activeNotebook.cellCount,
      codeCells: codeCells.length,
      markdownCells: cells.length - codeCells.length,
      executedCells: executedCells.length,
      errors,
      variables,
      plots,
      lastExecution: new Date()
    };
  }

  private notifyChange() {
    if (this.onNotebookChange) {
      const analysis = this.analyzeNotebook();
      if (analysis) {
        this.onNotebookChange(analysis);
      }
    }
  }

  public getCurrentAnalysis(): NotebookAnalysis | undefined {
    return this.analyzeNotebook();
  }

  public getActiveNotebook(): vscode.NotebookDocument | undefined {
    return this.activeNotebook;
  }

  public dispose() {
    this.disposables.forEach(d => d.dispose());
  }
}

class BackendAPI {
  private baseUrl: string;

  constructor(baseUrl: string = 'http://localhost:3000') {
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

  async uploadFile(filePath: string): Promise<any> {
    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');
      const FormData = require('form-data');
      
      console.log(`Attempting to upload file: ${filePath} to ${this.baseUrl}/upload`);
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
        }, (res: any) => {
          let data = '';
          res.on('data', (chunk: any) => data += chunk);
          res.on('end', () => {
            try {
              console.log(`Upload response status: ${res.statusCode}, data: ${data.substring(0, 500)}`);
              if (res.statusCode !== 200) {
                console.error(`Upload failed with status ${res.statusCode}:`, data);
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
                return;
              }
              const parsed = JSON.parse(data);
              console.log('Upload successful:', parsed);
              resolve(parsed);
            } catch (e) {
              console.error('Failed to parse upload response:', data);
              reject(new Error(`Failed to parse response: ${data.substring(0, 200)}`));
            }
          });
        });

        req.on('error', (err: any) => {
          console.error('Upload request error:', err);
          reject(err);
        });
        
        req.setTimeout(30000, () => {
          req.destroy();
          reject(new Error('Upload timeout - file may be too large'));
        });
        
        form.pipe(req);
      });
    } catch (error) {
      console.error('Upload API error:', error);
      throw error;
    }
  }

  async sendNotebookAnalysis(analysis: NotebookAnalysis, cellData?: NotebookCellData[]): Promise<any> {
    try {
      const https = require('https');
      const http = require('http');
      const url = require('url');
      
      const parsedUrl = url.parse(`${this.baseUrl}/notebook-analysis`);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const postData = JSON.stringify({
        analysis,
        cellData: cellData || [],
        timestamp: new Date().toISOString()
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
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Failed to parse response: ${data}`));
            }
          });
        });

        req.on('error', (err: any) => {
          console.error('Notebook analysis request error:', err);
          reject(err);
        });
        
        req.setTimeout(15000, () => {
          req.destroy();
          reject(new Error('Notebook analysis timeout'));
        });
        
        req.write(postData);
        req.end();
      });
    } catch (error) {
      console.error('Notebook analysis API error:', error);
      throw error;
    }
  }
}

class ChatPanel {
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
        
        showPlotsBtn.addEventListener('click', function() {
            vscode.postMessage({
                type: 'showPlots'
            });
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

  public dispose() {
    this.notebookMonitor.dispose();
    if (this.panel) {
      this.panel.dispose();
    }
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
  context.subscriptions.push({
    dispose: () => {
      chatPanel.dispose();
    }
  });
}


export function deactivate() {}