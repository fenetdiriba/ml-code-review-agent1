import * as vscode from 'vscode';
import { NotebookAnalysis, VariableInfo } from '../types';
import { BackendAPI } from '../backendAPI';
import { NotebookMonitor } from '../notebookMonitor';
import { MessageHandler } from './messageHandler';

export class NotebookAnalyzer {
  private api: BackendAPI;
  private context: vscode.ExtensionContext;
  private notebookMonitor: NotebookMonitor;
  private messageHandler: MessageHandler;
  private currentNotebookAnalysis: NotebookAnalysis | undefined;
  private reportedErrors: Set<string> = new Set();
  private reportedPlots: Set<string> = new Set();

  constructor(
    api: BackendAPI, 
    context: vscode.ExtensionContext, 
    notebookMonitor: NotebookMonitor,
    messageHandler: MessageHandler
  ) {
    this.api = api;
    this.context = context;
    this.notebookMonitor = notebookMonitor;
    this.messageHandler = messageHandler;
  }

  public handleNotebookAnalysis(analysis: NotebookAnalysis): void {
    this.currentNotebookAnalysis = analysis;
    
    // Only report new errors
    const newErrors = analysis.errors.filter(error => !this.reportedErrors.has(error));
    if (newErrors.length > 0) {
      const errorMessage = `🚨 **New Notebook Errors Detected:**\n${newErrors.map(err => `• ${err.substring(0, 100)}...`).join('\n')}`;
      this.messageHandler.addMessage('assistant', errorMessage);
      
      // Add new errors to reported set
      newErrors.forEach(error => this.reportedErrors.add(error));
    }

    // Only report new plots
    const newPlots = analysis.plots.filter(plot => {
      const plotKey = `${plot.cellIndex}-${plot.type}`;
      return !this.reportedPlots.has(plotKey);
    });
    
    if (newPlots.length > 0) {
      const plotMessage = `📊 **New Visualization Detected:**\n${newPlots.length} plot(s) generated in cells: ${newPlots.map(p => p.cellIndex).join(', ')}`;
      this.messageHandler.addMessage('assistant', plotMessage);
      
      // Add new plots to reported set
      newPlots.forEach(plot => {
        const plotKey = `${plot.cellIndex}-${plot.type}`;
        this.reportedPlots.add(plotKey);
      });
    }

    // Send analysis to backend for AI insights
    this.sendNotebookAnalysisToBackend(analysis);
  }

  private async sendNotebookAnalysisToBackend(analysis: NotebookAnalysis): Promise<void> {
    try {
      // upload file to backend first
      const active_notebook_url = this.notebookMonitor.getActiveNotebook()?.uri.toString();
      if (active_notebook_url) {
        console.log('Uploading active notebook to backend:', active_notebook_url);
        await this.api.uploadFile(active_notebook_url);
      }
      const result = await this.api.sendNotebookAnalysis(analysis);
      if (result.insights) {
        this.messageHandler.addMessage('assistant', `🔍 **Live Notebook Insights:**\n${result.insights}`);
      }
    } catch (error) {
      console.error('Failed to send notebook analysis to backend:', error);
    }
  }

  public async handleAnalyzeActiveNotebook(): Promise<void> {
    const notebook = this.notebookMonitor.getActiveNotebook();
    if (!notebook) {
      this.messageHandler.addMessage('assistant', '❌ No active notebook found. Please open a Jupyter notebook first.');
      return;
    }

    const analysis = this.notebookMonitor.getCurrentAnalysis();
    if (!analysis) {
      this.messageHandler.addMessage('assistant', '❌ Could not analyze notebook. Try executing some cells first.');
      return;
    }

    const summary = this.formatNotebookAnalysis(analysis);
    this.messageHandler.addMessage('user', '📊 Analyze Active Notebook');
    this.messageHandler.addMessage('assistant', summary);

    // Send to backend for detailed AI analysis
    try {
      const result = await this.api.sendNotebookAnalysis(analysis);
      if (result.analysis) {
        this.messageHandler.addMessage('assistant', `🤖 **AI Analysis:**\n${result.analysis}`);
      }
    } catch (error: any) {
      this.messageHandler.addMessage('assistant', `❌ Backend analysis failed: ${error?.message || 'Unknown error'}`);
    }
  }

  public handleGetNotebookStatus(): void {
    const notebook = this.notebookMonitor.getActiveNotebook();
    if (!notebook) {
      this.messageHandler.addMessage('assistant', '📓 No active notebook detected.');
      return;
    }

    const analysis = this.notebookMonitor.getCurrentAnalysis();
    if (analysis) {
      const status = this.formatNotebookStatus(analysis);
      this.messageHandler.addMessage('assistant', status);
    } else {
      this.messageHandler.addMessage('assistant', `📓 Active notebook: ${notebook.uri.path}\n⏳ No execution data available yet.`);
    }
  }

  public handleShowVariables(): void {
    const analysis = this.currentNotebookAnalysis;
    if (!analysis || analysis.variables.length === 0) {
      this.messageHandler.addMessage('assistant', '🔢 No variables detected in active notebook. Try executing some code cells first.');
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

    this.messageHandler.addMessage('assistant', variableReport);
  }

  public handleShowPlots(): void {
    const analysis = this.currentNotebookAnalysis;
    if (!analysis || analysis.plots.length === 0) {
      this.messageHandler.addMessage('assistant', '📊 No plots detected in active notebook. Try running cells with matplotlib or other visualization libraries.');
      return;
    }

    let plotReport = `📊 **Notebook Plots (${analysis.plots.length})**\n\n`;
    
    analysis.plots.forEach((plot, index) => {
      plotReport += `**Plot ${index + 1}:** ${plot.type} in Cell ${plot.cellIndex}\n`;
      if (plot.metadata) {
        plotReport += `• Metadata: ${JSON.stringify(plot.metadata, null, 2).substring(0, 100)}...\n`;
      }
      plotReport += '\n';
    });

    this.messageHandler.addMessage('assistant', plotReport);
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

  public getCurrentNotebookAnalysis(): NotebookAnalysis | undefined {
    return this.currentNotebookAnalysis;
  }

  public clearReportedItems(): void {
    this.reportedErrors.clear();
    this.reportedPlots.clear();
  }

  public getNotebookConnectionInfo(): { html: string, connected: boolean } {
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
}