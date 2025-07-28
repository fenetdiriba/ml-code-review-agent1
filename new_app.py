import requests
import json
import nbformat
from typing import Optional, Dict, Any, List
import os
from dotenv import load_dotenv

# Load environment variables
_ = load_dotenv("../variables.env")
_ = load_dotenv("secrets.env")
API_KEY = os.environ.get("API_KEY")

class NvidiaLlamaAgent:
    """
    Enhanced wrapper for interacting with NVIDIA's Llama chat endpoint.
    Now includes comprehensive notebook analysis with output reading.
    """
    def __init__(self, api_key: str):
        """Initialize the agent with the provided API key."""
        self.base_url = "https://integrate.api.nvidia.com/v1"
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        self.current_notebook = None
        self.message_history = []
        
    def set_notebook(self, notebook: str):
        """Set the current notebook for the agent."""
        self.current_notebook = notebook

    def extract_notebook_content(self, include_outputs: bool = True) -> Dict[str, Any]:
        """
        Extract comprehensive content from the notebook including outputs.
        
        Args:
            include_outputs (bool): Whether to include cell outputs
            
        Returns:
            Dict containing organized notebook content
        """
        if not self.current_notebook:
            return {"error": "No notebook set for analysis"}
            
        try:
            with open(self.current_notebook, "r", encoding="utf-8") as f:
                nb = nbformat.read(f, as_version=4)
        except Exception as e:
            return {"error": f"Failed to read notebook: {e}"}

        notebook_content = {
            "metadata": nb.metadata,
            "cells": [],
            "summary": {
                "total_cells": len(nb.cells),
                "code_cells": 0,
                "markdown_cells": 0,
                "raw_cells": 0,
                "executed_cells": 0,
                "cells_with_outputs": 0,
                "cells_with_errors": 0
            }
        }

        for i, cell in enumerate(nb.cells):
            cell_data = {
                "cell_number": i + 1,
                "cell_type": cell.cell_type,
                "source": cell.source,
                "metadata": cell.metadata
            }
            
            # Count cell types
            if cell.cell_type == "code":
                notebook_content["summary"]["code_cells"] += 1
                
                # Check if cell was executed
                if hasattr(cell, 'execution_count') and cell.execution_count is not None:
                    notebook_content["summary"]["executed_cells"] += 1
                    cell_data["execution_count"] = cell.execution_count
                
                # Extract outputs if requested and available
                if include_outputs and hasattr(cell, 'outputs') and cell.outputs:
                    notebook_content["summary"]["cells_with_outputs"] += 1
                    cell_data["outputs"] = []
                    
                    for output in cell.outputs:
                        output_data = {
                            "output_type": output.output_type
                        }
                        
                        # Handle different output types
                        if output.output_type == "execute_result":
                            output_data["execution_count"] = getattr(output, 'execution_count', None)
                            output_data["data"] = getattr(output, 'data', {})
                            output_data["metadata"] = getattr(output, 'metadata', {})
                            
                        elif output.output_type == "display_data":
                            output_data["data"] = getattr(output, 'data', {})
                            output_data["metadata"] = getattr(output, 'metadata', {})
                            
                        elif output.output_type == "stream":
                            output_data["name"] = getattr(output, 'name', '')
                            output_data["text"] = getattr(output, 'text', '')
                            
                        elif output.output_type == "error":
                            notebook_content["summary"]["cells_with_errors"] += 1
                            output_data["ename"] = getattr(output, 'ename', '')
                            output_data["evalue"] = getattr(output, 'evalue', '')
                            output_data["traceback"] = getattr(output, 'traceback', [])
                        
                        cell_data["outputs"].append(output_data)
                        
            elif cell.cell_type == "markdown":
                notebook_content["summary"]["markdown_cells"] += 1
            elif cell.cell_type == "raw":
                notebook_content["summary"]["raw_cells"] += 1
            
            notebook_content["cells"].append(cell_data)
        
        return notebook_content

    def analyze_notebook(self, 
                        include_outputs: bool = True,
                        focus_areas: List[str] = None) -> Optional[str]:
        """
        Analyze the current notebook with comprehensive output reading.
        
        Args:
            include_outputs (bool): Whether to include cell outputs in analysis
            focus_areas (List[str]): Specific areas to focus on (e.g., ['errors', 'plots', 'results'])
            
        Returns:
            Optional[str]: Analysis results or None if an error occurred
        """
        if not self.current_notebook:
            print("No notebook set for analysis.")
            return None
            
        # Extract comprehensive notebook content
        notebook_content = self.extract_notebook_content(include_outputs=include_outputs)
        
        if "error" in notebook_content:
            print(f"Error extracting notebook content: {notebook_content['error']}")
            return None
        
        # Build analysis prompt based on focus areas
        prompt_parts = [
            "Analyze the following Jupyter notebook content and provide comprehensive insights:"
        ]
        
        # Add summary information
        summary = notebook_content["summary"]
        prompt_parts.append(f"""
NOTEBOOK SUMMARY:
- Total cells: {summary['total_cells']}
- Code cells: {summary['code_cells']} (executed: {summary['executed_cells']})
- Markdown cells: {summary['markdown_cells']}
- Cells with outputs: {summary['cells_with_outputs']}
- Cells with errors: {summary['cells_with_errors']}
""")
        
        # Add specific focus instructions
        if focus_areas:
            focus_instructions = []
            if 'errors' in focus_areas:
                focus_instructions.append("- Pay special attention to any errors and suggest fixes")
            if 'plots' in focus_areas:
                focus_instructions.append("- Analyze any visualizations and data plots")
            if 'results' in focus_areas:
                focus_instructions.append("- Focus on numerical results and model outputs")
            if 'performance' in focus_areas:
                focus_instructions.append("- Evaluate code performance and efficiency")
            
            if focus_instructions:
                prompt_parts.append("FOCUS AREAS:\n" + "\n".join(focus_instructions))
        
        # Add cell content (truncated to avoid token limits)
        prompt_parts.append("\nNOTEBOOK CONTENT:")
        
        # Limit content to avoid token overflow
        max_cells_to_include = 20
        cells_included = 0
        
        for cell in notebook_content["cells"]:
            if cells_included >= max_cells_to_include:
                prompt_parts.append(f"\n[... {len(notebook_content['cells']) - cells_included} more cells truncated ...]")
                break
                
            cell_info = f"\nCell {cell['cell_number']} ({cell['cell_type']}):"
            
            # Add source code
            if cell['source']:
                source_preview = cell['source'][:500] + "..." if len(cell['source']) > 500 else cell['source']
                cell_info += f"\nSource: {source_preview}"
            
            # Add outputs if available and requested
            if include_outputs and 'outputs' in cell:
                for j, output in enumerate(cell['outputs']):
                    output_info = f"\nOutput {j+1} ({output['output_type']}):"
                    
                    if output['output_type'] == 'stream' and 'text' in output:
                        text_preview = output['text'][:200] + "..." if len(str(output['text'])) > 200 else output['text']
                        output_info += f" {text_preview}"
                    elif output['output_type'] == 'execute_result' and 'data' in output:
                        if 'text/plain' in output['data']:
                            result_preview = str(output['data']['text/plain'])[:200]
                            output_info += f" {result_preview}"
                    elif output['output_type'] == 'error':
                        output_info += f" ERROR: {output.get('ename', '')}: {output.get('evalue', '')}"
                    
                    cell_info += output_info
            
            prompt_parts.append(cell_info)
            cells_included += 1
        
        # Add analysis instructions
        prompt_parts.append("""
Please provide:
1. Overall assessment of the notebook's purpose and quality
2. Analysis of the code structure and logic
3. Evaluation of any results, outputs, or visualizations
4. Identification of any errors or issues
5. Suggestions for improvement
6. Summary of key findings or insights
""")
        
        full_prompt = "\n".join(prompt_parts)
        
        # Send to model for analysis
        chat_result = self.chat(full_prompt)
        
        if chat_result:
            print("Notebook Analysis Complete!")
            self.message_history.append({"role": "assistant", "content": chat_result})
            print(chat_result)
            return chat_result
        else:
            print("Failed to analyze notebook")
            return None

    def analyze_specific_outputs(self, output_types: List[str] = None) -> Optional[str]:
        """
        Analyze specific types of outputs in the notebook.
        
        Args:
            output_types (List[str]): Types to focus on ['errors', 'plots', 'results', 'streams']
            
        Returns:
            Optional[str]: Focused analysis of outputs
        """
        if not self.current_notebook:
            return "No notebook set for analysis."
            
        notebook_content = self.extract_notebook_content(include_outputs=True)
        
        if "error" in notebook_content:
            return f"Error: {notebook_content['error']}"
        
        # Filter for cells with specified output types
        relevant_outputs = []
        
        for cell in notebook_content["cells"]:
            if cell["cell_type"] == "code" and "outputs" in cell:
                for output in cell["outputs"]:
                    if not output_types or output["output_type"] in output_types:
                        relevant_outputs.append({
                            "cell_number": cell["cell_number"],
                            "source": cell["source"][:200] + "..." if len(cell["source"]) > 200 else cell["source"],
                            "output": output
                        })
        
        if not relevant_outputs:
            return "No outputs of the specified types found in the notebook."
        
        prompt = f"""Analyze the following specific outputs from a Jupyter notebook:

Found {len(relevant_outputs)} relevant outputs:

"""
        
        for i, item in enumerate(relevant_outputs[:10]):  # Limit to first 10
            prompt += f"""
Output {i+1} from Cell {item['cell_number']}:
Source code: {item['source']}
Output type: {item['output']['output_type']}
"""
            if item['output']['output_type'] == 'error':
                prompt += f"Error: {item['output'].get('ename', '')}: {item['output'].get('evalue', '')}\n"
            elif 'text' in item['output']:
                prompt += f"Text: {str(item['output']['text'])[:300]}\n"
            elif 'data' in item['output'] and 'text/plain' in item['output']['data']:
                prompt += f"Result: {str(item['output']['data']['text/plain'])[:300]}\n"

        prompt += "\nProvide focused analysis of these outputs, identify patterns, issues, and suggestions."
        
        return self.chat(prompt)

    def chat(self,
             message: str,
             model: str = "meta/llama-3.1-8b-instruct",
             max_tokens: int = 1024,  # Increased for more detailed analysis
             temperature: float = 0.7) -> Optional[str]:
        """Send a chat message and receive a response."""
        url = f"{self.base_url}/chat/completions"
        payload: Dict[str, Any] = {
            "model": model,
            "messages": [{"role": "user", "content": message}],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False
        }
        
        try:
            resp = requests.post(url, headers=self.headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        except (requests.RequestException, KeyError) as e:
            print(f"Chat request failed: {e}")
            return None

# Example usage
if __name__ == "__main__":
    # Create agent and set notebook
    agent = NvidiaLlamaAgent(API_KEY)
    agent.set_notebook("your_notebook.ipynb")
    
    # Full analysis including outputs
    print("=== FULL NOTEBOOK ANALYSIS ===")
    analysis = agent.analyze_notebook(include_outputs=True, focus_areas=['errors', 'results'])
    if analysis:
        print(analysis)
    
    # Analyze specific output types
    print("\n=== ERROR ANALYSIS ===")
    error_analysis = agent.analyze_specific_outputs(['error'])
    if error_analysis:
        print(error_analysis)
    
    # Extract just the content structure
    print("\n=== NOTEBOOK STRUCTURE ===")
    content = agent.extract_notebook_content(include_outputs=True)
    print(json.dumps(content['summary'], indent=2))