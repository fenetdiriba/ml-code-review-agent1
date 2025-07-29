import * as vscode from 'vscode';
import { NotebookCellData, NotebookAnalysis, VariableInfo, PlotInfo } from './types';

export class NotebookMonitor {
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
    console.log(`Active notebook set: ${notebook.uri.toString()}`);
    this.cellData.clear();
    // this.analyzeNotebook();
  }

  private handleNotebookChange(event: vscode.NotebookDocumentChangeEvent) {
    // Handle cell content changes
    // for (const change of event.contentChanges) {
    //   for (const cell of change.addedCells || []) {
    //     this.updateCellData(cell);
    //   }
    //   for (const cell of change.removedCells || []) {
    //     this.cellData.delete(cell.document.uri.toString());
    //   }
    // }
    
    // // Handle cell output changes
    // for (const change of event.cellChanges) {
    //   if (change.outputs) {
    //     this.updateCellData(change.cell);
    //   }
    // }

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