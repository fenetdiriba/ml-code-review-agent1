import * as vscode from 'vscode';
import { NotebookAnalysis } from './types';
import { BackendAPI } from './backendAPI';
import { NotebookMonitor } from './notebookMonitor';
import { MessageHandler } from './chatPanel/messageHandler';
import { FileUploadHandler } from './chatPanel/fileUploadHandler';
import { NotebookAnalyzer } from './chatPanel/notebookAnalyzer';
import { VariableInspector } from './chatPanel/variableInspector';
import { WebviewProvider } from './chatPanel/webviewProvider';

export class ChatPanel {
  private api: BackendAPI;
  private context: vscode.ExtensionContext;
  private notebookMonitor: NotebookMonitor;
  private messageHandler: MessageHandler;
  private fileUploadHandler: FileUploadHandler;
  private notebookAnalyzer: NotebookAnalyzer;
  private variableInspector: VariableInspector;
  private webviewProvider: WebviewProvider;
  private lastNotebookPath: string | undefined;

  constructor(api: BackendAPI, context: vscode.ExtensionContext) {
    this.api = api;
    this.context = context;
    this.notebookMonitor = new NotebookMonitor((analysis) => {
      this.handleNotebookAnalysis(analysis);
    });
    
    // Initialize components
    this.messageHandler = new MessageHandler(api);
    this.fileUploadHandler = new FileUploadHandler(api, this.messageHandler);
    this.notebookAnalyzer = new NotebookAnalyzer(api, context, this.notebookMonitor, this.messageHandler);
    this.variableInspector = new VariableInspector(context, this.notebookMonitor, this.messageHandler);
    this.webviewProvider = new WebviewProvider(this.notebookAnalyzer);
  }

  public async show() {
    this.webviewProvider.show();
    this.setupWebviewMessageHandling();
    this.updateWebview();
    
    // Auto-upload active notebook if available
    await this.uploadActiveNotebook();
    
    // Small delay to ensure webview is ready
    setTimeout(() => {
      console.log('🔄 Webview should be ready now');
    }, 1000);
  }

  private setupWebviewMessageHandling() {
    const panel = this.webviewProvider.getPanel();
    if (!panel) return;

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'sendMessage':
          await this.messageHandler.handleUserMessage(message.content);
          this.updateMessagesOnly();
          break;
        case 'clearChat':
          this.messageHandler.clearMessages();
          this.updateMessagesOnly();
          break;
        case 'uploadFile':
          await this.fileUploadHandler.handleUploadFile();
          this.updateWebview();
          break;
        case 'uploadImage':
          await this.fileUploadHandler.handleUploadImage();
          this.updateWebview();
          break;
        case 'uploadNotebook':
          await this.fileUploadHandler.handleUploadNotebook();
          this.updateWebview();
          // Auto-trigger analysis if upload was successful and we're in analyze context
          await this.autoTriggerAnalysisAfterUpload();
          break;
        case 'analyzeActiveNotebook':
          await this.notebookAnalyzer.handleAnalyzeActiveNotebook();
          this.updateWebview();
          break;
        case 'getNotebookStatus':
          this.notebookAnalyzer.handleGetNotebookStatus();
          this.updateWebview();
          break;
        case 'showVariables':
          this.notebookAnalyzer.handleShowVariables();
          this.updateWebview();
          break;
        case 'showPlots':
          this.notebookAnalyzer.handleShowPlots();
          this.updateWebview();
          break;
        case 'getLiveVariables':
          await this.variableInspector.handleGetLiveVariables();
          this.updateWebview();
          break;
        case 'getSuggestions':
          await this.handleGetSuggestions();
          break;
        case 'getVisualizations':
          await this.handleGetVisualizations();
          break;
        case 'getAnalysis':
          await this.handleGetAnalysis();
          break;
        case 'generateCode':
          await this.handleGenerateCode(message.data);
          break;
        case 'analyzeCode':
          await this.handleAnalyzeCode(message.data);
          break;
      }
    });
  }

  private handleNotebookAnalysis(analysis: NotebookAnalysis) {
    // Check if we have a new notebook and clear reported items if so
    const currentNotebook = this.notebookMonitor.getActiveNotebook();
    const currentNotebookPath = currentNotebook?.uri.path;
    
    if (this.lastNotebookPath !== currentNotebookPath) {
      this.lastNotebookPath = currentNotebookPath;
      this.notebookAnalyzer.clearReportedItems();
    }
    
    this.notebookAnalyzer.handleNotebookAnalysis(analysis);
    this.updateNotebookConnectionDisplay();
    this.updateWebview();
  }

  private updateWebview() {
    this.webviewProvider.updateWebview(this.messageHandler.getMessages());
  }

  private updateMessagesOnly() {
    this.webviewProvider.updateMessagesOnly(this.messageHandler.getMessages());
  }

  private updateNotebookConnectionDisplay() {
    this.webviewProvider.updateNotebookConnectionDisplay();
  }

  private async uploadActiveNotebook(): Promise<boolean> {
    try {
      let active_notebook_url = this.notebookMonitor.getActiveNotebook()?.uri.toString();
      
      if (active_notebook_url) {
        console.log('Uploading active notebook:', active_notebook_url);
        // Convert file:// URL to actual file path if needed
        let uploadPath = active_notebook_url;
        if (active_notebook_url.startsWith('file://')) {
          uploadPath = decodeURIComponent(active_notebook_url.replace('file://', ''));
        }
        // Upload the active notebook file to the backend
        let response = await this.api.uploadFile(uploadPath);
        console.log('Notebook upload successful:', response);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Notebook upload failed:', error);
      return false;
    }
  }

  private async handleGetSuggestions() {
    console.log('🔄 handleGetSuggestions called');
    const panel = this.webviewProvider.getPanel();
    if (!panel) {
      console.error('❌ No webview panel available');
      return;
    }

    try {
      console.log('📤 Uploading active notebook...');
      // Upload active notebook first
      await this.uploadActiveNotebook();
      
      console.log('📡 Getting suggestions from backend...');
      const response = await this.api.getSuggestions();
      console.log('✅ Got suggestions response:', response);
  
      console.log('📤 Sending suggestions to webview...');
      console.log('📤 Message data:', response);
      panel.webview.postMessage({
        type: 'suggestionsReceived',
        data: response
      });
      console.log('✅ Suggestions sent to webview');
    } catch (error) {
      console.error('❌ Error getting suggestions:', error);
      panel.webview.postMessage({
        type: 'suggestionsError',
        data: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  private async handleGetVisualizations() {
    const panel = this.webviewProvider.getPanel();
    if (!panel) return;

    try {
      // Upload active notebook first
      await this.uploadActiveNotebook();

      const visualizations = await this.api.getVisualizations();
      panel.webview.postMessage({
        type: 'visualizationsReceived',
        data: visualizations
      });
    } catch (error) {
      console.error('Error getting visualizations:', error);
      panel.webview.postMessage({
        type: 'visualizationsError',
        data: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  private async handleGetAnalysis() {
    const panel = this.webviewProvider.getPanel();
    if (!panel) return;

    try {
      // Upload active notebook first
      await this.uploadActiveNotebook();

      const analysis = await this.api.getAnalysis();
      console.log('📤 Sending analysis to webview:', analysis);
      panel.webview.postMessage({
        type: 'analysisReceived',
        data: analysis
      });
      console.log('✅ Analysis sent to webview');
    } catch (error) {
      console.error('Error getting analysis:', error);
      panel.webview.postMessage({
        type: 'analysisError',
        data: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  private async handleGenerateCode(suggestionData: any) {
    const panel = this.webviewProvider.getPanel();
    if (!panel) return;

    try {
      const code = await this.api.generateCode(suggestionData);
      panel.webview.postMessage({
        type: 'codeGenerated',
        data: code
      });
    } catch (error) {
      console.error('Error generating code:', error);
      panel.webview.postMessage({
        type: 'codeGenerationError',
        data: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }
  }

  private async autoTriggerAnalysisAfterUpload() {
    // Small delay to ensure upload processing is complete
    setTimeout(async () => {
      try {
        await this.handleGetAnalysis();
      } catch (error) {
        console.error('Auto-analysis failed:', error);
      }
    }, 1000);
  }

  private async handleAnalyzeCode(data: { code: string }) {
    const panel = this.webviewProvider.getPanel();
    if (!panel) return;

    try {
      // Add the code to chat for context
      this.messageHandler.addMessage('user', `🔍 Analyzing code:\n\`\`\`python\n${data.code.substring(0, 200)}${data.code.length > 200 ? '...' : ''}\n\`\`\``);
      
      // Get analysis from backend with the provided code
      const analysis = await this.api.getAnalysis(data.code);
      
      // Send analysis result to the analyze tab
      panel.webview.postMessage({
        type: 'analysisReceived',
        data: analysis
      });
      
      // Also add to chat for history
      this.messageHandler.addMessage('assistant', `✅ Code analysis completed. Check the Analyze tab for detailed results.`);
      this.updateWebview();
      
    } catch (error) {
      console.error('Error analyzing code:', error);
      panel.webview.postMessage({
        type: 'analysisError',
        data: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
      
      this.messageHandler.addMessage('assistant', `❌ Code analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.updateWebview();
    }
  }

  public dispose() {
    this.notebookMonitor.dispose();
    this.webviewProvider.dispose();
  }
}