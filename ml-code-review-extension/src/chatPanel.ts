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

  public show() {
    this.webviewProvider.show();
    this.setupWebviewMessageHandling();
    this.updateWebview();
  }

  private setupWebviewMessageHandling() {
    const panel = this.webviewProvider.getPanel();
    if (!panel) return;

    panel.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case 'sendMessage':
          await this.messageHandler.handleUserMessage(message.content);
          this.updateWebview();
          break;
        case 'clearChat':
          this.messageHandler.clearMessages();
          this.updateWebview();
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
      }
    });
  }

  private handleNotebookAnalysis(analysis: NotebookAnalysis) {
    this.notebookAnalyzer.handleNotebookAnalysis(analysis);
    this.updateNotebookConnectionDisplay();
    this.updateWebview();
  }

  private updateWebview() {
    this.webviewProvider.updateWebview(this.messageHandler.getMessages());
  }

  private updateNotebookConnectionDisplay() {
    this.webviewProvider.updateNotebookConnectionDisplay();
  }

  public dispose() {
    this.notebookMonitor.dispose();
    this.webviewProvider.dispose();
  }
}