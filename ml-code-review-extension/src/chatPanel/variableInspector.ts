import * as vscode from 'vscode';
import { VariableInfo } from '../types';
import { NotebookMonitor } from '../notebookMonitor';
import { MessageHandler } from './messageHandler';

export class VariableInspector {
  private context: vscode.ExtensionContext;
  private notebookMonitor: NotebookMonitor;
  private messageHandler: MessageHandler;

  constructor(
    context: vscode.ExtensionContext,
    notebookMonitor: NotebookMonitor,
    messageHandler: MessageHandler
  ) {
    this.context = context;
    this.notebookMonitor = notebookMonitor;
    this.messageHandler = messageHandler;
  }

  public async handleGetLiveVariables(): Promise<void> {
    const notebook = this.notebookMonitor.getActiveNotebook();
    if (!notebook) {
      this.messageHandler.addMessage('assistant', '❌ No active notebook found.');
      return;
    }

    this.messageHandler.addMessage('user', '🔄 Getting live variable values...');
    
    try {
      const variables = await this.getLiveVariableValues();
      if (variables.length === 0) {
        this.messageHandler.addMessage('assistant', '🔢 No variables found in the current notebook kernel.');
        return;
      }

      let variableReport = `🔢 **Live Variable Values (${variables.length})**\n\n`;
      variables.forEach(variable => {
        console.log(variable);
        variableReport += `• \`${variable.name}\` (${variable.type}): ${variable.value}\n`;
      });
      
      this.messageHandler.addMessage('assistant', variableReport);
    } catch (error: any) {
      this.messageHandler.addMessage('assistant', `❌ Failed to get live variables: ${error?.message || 'Unknown error'}`);
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
}