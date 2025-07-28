export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

export interface NotebookCellData {
  index: number;
  cellType: string;
  source: string;
  outputs: any[];
  executionCount?: number;
  executionSummary?: any;
  metadata: any;
}

export interface NotebookAnalysis {
  totalCells: number;
  codeCells: number;
  markdownCells: number;
  executedCells: number;
  errors: string[];
  variables: VariableInfo[];
  plots: PlotInfo[];
  lastExecution?: Date;
}

export interface VariableInfo {
  name: string;
  type: string;
  value?: string;
  cellIndex: number;
  line: number;
}

export interface PlotInfo {
  cellIndex: number;
  type: string;
  data: string; // base64 image data
  metadata?: any;
}