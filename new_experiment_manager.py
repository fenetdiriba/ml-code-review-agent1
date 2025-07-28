import requests
import json
import nbformat
from nbconvert.preprocessors import ExecutePreprocessor
from nbconvert import HTMLExporter
import matplotlib.pyplot as plt
import matplotlib
import base64
import io
import os
import shutil
from datetime import datetime
from pathlib import Path
import uuid
import re
from typing import Optional, Dict, Any, List, Tuple
from dotenv import load_dotenv
import subprocess
import sys

# Load environment variables
_ = load_dotenv("../variables.env")
_ = load_dotenv("secrets.env")
API_KEY = os.environ.get("API_KEY")

class NotebookExecutorWithVisualization:
    """
    Advanced notebook manager that can execute notebooks, save visualizations,
    and provide comprehensive analysis with AI insights.
    """
    
    def __init__(self, api_key: str, experiments_dir: str = "experiments"):
        """Initialize the notebook executor and visualization manager."""
        self.base_url = "https://integrate.api.nvidia.com/v1"
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # Setup directories
        self.experiments_dir = Path(experiments_dir)
        self.experiments_dir.mkdir(exist_ok=True)
        self.current_notebook = None
        self.current_experiment = None
        
        # Execution settings
        self.execution_timeout = 600  # 10 minutes per cell
        self.kernel_name = "python3"
        
        # Visualization settings
        matplotlib.use('Agg')  # Non-interactive backend
        
        # Initialize experiment tracking
        self.tracking_file = self.experiments_dir / "experiment_log.json"
        self._load_experiment_log()
    
    def _load_experiment_log(self):
        """Load or create experiment tracking log."""
        if self.tracking_file.exists():
            with open(self.tracking_file, 'r') as f:
                self.experiment_log = json.load(f)
        else:
            self.experiment_log = {
                "experiments": {},
                "created": datetime.now().isoformat(),
                "last_updated": datetime.now().isoformat()
            }
            self._save_experiment_log()
    
    def _save_experiment_log(self):
        """Save experiment tracking log."""
        self.experiment_log["last_updated"] = datetime.now().isoformat()
        with open(self.tracking_file, 'w') as f:
            json.dump(self.experiment_log, f, indent=2)
    
    def create_experiment(self, name: str, description: str = "", tags: List[str] = None) -> str:
        """Create a new experiment with proper directory structure."""
        experiment_id = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{name.replace(' ', '_')}"
        experiment_dir = self.experiments_dir / experiment_id
        experiment_dir.mkdir(exist_ok=True)
        
        # Create all necessary subdirectories
        subdirs = ["notebooks", "outputs", "analysis", "data", "visualizations", "executed_notebooks", "logs"]
        for subdir in subdirs:
            (experiment_dir / subdir).mkdir(exist_ok=True)
        
        # Create experiment metadata
        experiment_metadata = {
            "id": experiment_id,
            "name": name,
            "description": description,
            "tags": tags or [],
            "created": datetime.now().isoformat(),
            "status": "active",
            "notebooks": [],
            "executions": [],
            "visualizations": [],
            "analysis_results": []
        }
        
        # Save metadata
        metadata_file = experiment_dir / "experiment_metadata.json"
        with open(metadata_file, 'w') as f:
            json.dump(experiment_metadata, f, indent=2)
        
        # Update global log
        self.experiment_log["experiments"][experiment_id] = experiment_metadata
        self._save_experiment_log()
        
        self.current_experiment = experiment_id
        print(f"✅ Created experiment: {experiment_id}")
        return experiment_id
    
    def execute_notebook(self, 
                        notebook_path: str,
                        experiment_id: str = None,
                        save_outputs: bool = True,
                        extract_visualizations: bool = True,
                        timeout: int = None) -> Dict[str, Any]:
        """
        Execute a notebook and optionally save outputs and visualizations.
        
        Args:
            notebook_path (str): Path to notebook to execute
            experiment_id (str): Target experiment (uses current if None)
            save_outputs (bool): Whether to save execution outputs
            extract_visualizations (bool): Whether to extract and save plots
            timeout (int): Execution timeout per cell in seconds
            
        Returns:
            Dict containing execution results and paths
        """
        if not os.path.exists(notebook_path):
            raise FileNotFoundError(f"Notebook not found: {notebook_path}")
        
        # Use current experiment if none specified
        if not experiment_id:
            experiment_id = self.current_experiment
        if not experiment_id:
            raise ValueError("No experiment specified")
        
        experiment_dir = self.experiments_dir / experiment_id
        if not experiment_dir.exists():
            raise ValueError(f"Experiment not found: {experiment_id}")
        
        print(f"🚀 Executing notebook: {Path(notebook_path).name}")
        
        # Load notebook
        with open(notebook_path, 'r') as f:
            nb = nbformat.read(f, as_version=4)
        
        # Setup execution
        execution_timeout = timeout or self.execution_timeout
        ep = ExecutePreprocessor(
            timeout=execution_timeout,
            kernel_name=self.kernel_name,
            allow_errors=True  # Continue execution even if some cells fail
        )
        
        execution_id = f"exec_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        
        try:
            # Execute notebook
            print("⚡ Running notebook execution...")
            ep.preprocess(nb, {'metadata': {'path': str(Path(notebook_path).parent)}})
            
            # Generate executed notebook filename
            original_name = Path(notebook_path).stem
            executed_filename = f"{original_name}_{execution_id}_executed.ipynb"
            executed_path = experiment_dir / "executed_notebooks" / executed_filename
            
            # Save executed notebook
            if save_outputs:
                with open(executed_path, 'w') as f:
                    nbformat.write(nb, f)
                print(f"💾 Saved executed notebook: {executed_filename}")
            
            # Extract visualizations
            visualizations = []
            if extract_visualizations:
                visualizations = self._extract_visualizations_from_notebook(
                    nb, experiment_dir, execution_id
                )
                print(f"🎨 Extracted {len(visualizations)} visualizations")
            
            # Generate execution report
            execution_report = self._generate_execution_report(nb, visualizations)
            
            # Save execution report
            report_path = experiment_dir / "logs" / f"{execution_id}_report.json"
            with open(report_path, 'w') as f:
                json.dump(execution_report, f, indent=2)
            
            # Create execution summary
            execution_summary = {
                "execution_id": execution_id,
                "notebook_path": notebook_path,
                "executed_notebook_path": str(executed_path) if save_outputs else None,
                "execution_time": datetime.now().isoformat(),
                "status": "completed",
                "cells_executed": len(nb.cells),
                "cells_with_errors": execution_report["cells_with_errors"],
                "visualizations_count": len(visualizations),
                "visualizations": visualizations,
                "report_path": str(report_path)
            }
            
            # Update experiment metadata
            self._update_experiment_with_execution(experiment_id, execution_summary)
            
            print("✅ Notebook execution completed successfully!")
            return execution_summary
            
        except Exception as e:
            error_summary = {
                "execution_id": execution_id,
                "notebook_path": notebook_path,
                "execution_time": datetime.now().isoformat(),
                "status": "failed",
                "error": str(e)
            }
            
            # Save error log
            error_path = experiment_dir / "logs" / f"{execution_id}_error.json"
            with open(error_path, 'w') as f:
                json.dump(error_summary, f, indent=2)
            
            print(f"❌ Execution failed: {e}")
            return error_summary
    
    def _extract_visualizations_from_notebook(self, nb, experiment_dir: Path, execution_id: str) -> List[Dict]:
        """Extract and save visualizations from executed notebook."""
        visualizations = []
        viz_dir = experiment_dir / "visualizations" / execution_id
        viz_dir.mkdir(exist_ok=True)
        
        for cell_idx, cell in enumerate(nb.cells):
            if cell.cell_type == "code" and hasattr(cell, 'outputs'):
                for output_idx, output in enumerate(cell.outputs):
                    # Handle display_data and execute_result outputs
                    if output.output_type in ['display_data', 'execute_result']:
                        if hasattr(output, 'data') and output.data:
                            # Look for image data
                            for mime_type in ['image/png', 'image/jpeg', 'image/svg+xml']:
                                if mime_type in output.data:
                                    viz_info = self._save_visualization(
                                        output.data[mime_type],
                                        mime_type,
                                        viz_dir,
                                        f"cell_{cell_idx}_output_{output_idx}",
                                        cell_idx,
                                        output_idx
                                    )
                                    if viz_info:
                                        visualizations.append(viz_info)
        
        return visualizations
    
    def _save_visualization(self, data: str, mime_type: str, viz_dir: Path, 
                          filename_base: str, cell_idx: int, output_idx: int) -> Optional[Dict]:
        """Save individual visualization to file."""
        try:
            # Determine file extension
            ext_map = {
                'image/png': '.png',
                'image/jpeg': '.jpg', 
                'image/svg+xml': '.svg'
            }
            
            if mime_type not in ext_map:
                return None
            
            filename = f"{filename_base}{ext_map[mime_type]}"
            filepath = viz_dir / filename
            
            if mime_type == 'image/svg+xml':
                # SVG is text-based
                with open(filepath, 'w') as f:
                    f.write(data)
            else:
                # PNG/JPEG are base64 encoded
                image_data = base64.b64decode(data)
                with open(filepath, 'wb') as f:
                    f.write(image_data)
            
            viz_info = {
                "filename": filename,
                "filepath": str(filepath),
                "mime_type": mime_type,
                "cell_index": cell_idx,
                "output_index": output_idx,
                "file_size": os.path.getsize(filepath),
                "saved_at": datetime.now().isoformat()
            }
            
            return viz_info
            
        except Exception as e:
            print(f"⚠️  Failed to save visualization: {e}")
            return None
    
    def _generate_execution_report(self, nb, visualizations: List[Dict]) -> Dict:
        """Generate comprehensive execution report."""
        report = {
            "execution_summary": {
                "total_cells": len(nb.cells),
                "code_cells": 0,
                "markdown_cells": 0,
                "cells_with_outputs": 0,
                "cells_with_errors": 0,
                "total_visualizations": len(visualizations)
            },
            "cell_details": [],
            "errors": [],
            "visualizations": visualizations
        }
        
        for i, cell in enumerate(nb.cells):
            cell_info = {
                "cell_index": i,
                "cell_type": cell.cell_type,
                "has_outputs": False,
                "has_errors": False,
                "output_count": 0
            }
            
            if cell.cell_type == "code":
                report["execution_summary"]["code_cells"] += 1
                
                if hasattr(cell, 'outputs') and cell.outputs:
                    cell_info["has_outputs"] = True
                    cell_info["output_count"] = len(cell.outputs)
                    report["execution_summary"]["cells_with_outputs"] += 1
                    
                    # Check for errors
                    for output in cell.outputs:
                        if output.output_type == "error":
                            cell_info["has_errors"] = True
                            report["execution_summary"]["cells_with_errors"] += 1
                            
                            error_info = {
                                "cell_index": i,
                                "error_name": getattr(output, 'ename', ''),
                                "error_value": getattr(output, 'evalue', ''),
                                "traceback": getattr(output, 'traceback', [])
                            }
                            report["errors"].append(error_info)
                            break
                            
            elif cell.cell_type == "markdown":
                report["execution_summary"]["markdown_cells"] += 1
            
            report["cell_details"].append(cell_info)
        
        return report
    
    def _update_experiment_with_execution(self, experiment_id: str, execution_summary: Dict):
        """Update experiment metadata with execution information."""
        metadata_file = self.experiments_dir / experiment_id / "experiment_metadata.json"
        
        with open(metadata_file, 'r') as f:
            metadata = json.load(f)
        
        metadata["executions"].append(execution_summary)
        
        # Add visualizations to experiment tracking
        for viz in execution_summary.get("visualizations", []):
            metadata["visualizations"].append({
                "execution_id": execution_summary["execution_id"],
                "filename": viz["filename"],
                "filepath": viz["filepath"],
                "cell_index": viz["cell_index"],
                "created_at": viz["saved_at"]
            })
        
        with open(metadata_file, 'w') as f:
            json.dump(metadata, f, indent=2)
        
        # Update global log
        self.experiment_log["experiments"][experiment_id] = metadata
        self._save_experiment_log()
    
    def create_visualization_gallery(self, experiment_id: str) -> str:
        """Create an HTML gallery of all visualizations in an experiment."""
        experiment_dir = self.experiments_dir / experiment_id
        metadata_file = experiment_dir / "experiment_metadata.json"
        
        if not metadata_file.exists():
            raise ValueError(f"Experiment not found: {experiment_id}")
        
        with open(metadata_file, 'r') as f:
            metadata = json.load(f)
        
        visualizations = metadata.get("visualizations", [])
        
        if not visualizations:
            return "No visualizations found in this experiment."
        
        # Generate HTML gallery
        html_content = f"""
<!DOCTYPE html>
<html>
<head>
    <title>Visualization Gallery - {metadata['name']}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }}
        .header {{ background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }}
        .gallery {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; }}
        .viz-card {{ background: white; border-radius: 8px; padding: 15px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }}
        .viz-image {{ max-width: 100%; height: auto; border-radius: 4px; }}
        .viz-info {{ margin-top: 10px; font-size: 0.9em; color: #666; }}
        .execution-section {{ margin-bottom: 30px; }}
        .execution-header {{ background: #e9ecef; padding: 10px; border-radius: 4px; margin-bottom: 15px; }}
    </style>
</head>
<body>
    <div class="header">
        <h1>📊 Visualization Gallery</h1>
        <h2>{metadata['name']}</h2>
        <p><strong>Description:</strong> {metadata['description']}</p>
        <p><strong>Created:</strong> {metadata['created']}</p>
        <p><strong>Total Visualizations:</strong> {len(visualizations)}</p>
    </div>
"""
        
        # Group visualizations by execution
        executions = {}
        for viz in visualizations:
            exec_id = viz['execution_id']
            if exec_id not in executions:
                executions[exec_id] = []
            executions[exec_id].append(viz)
        
        # Generate gallery sections
        for exec_id, exec_vizs in executions.items():
            html_content += f"""
    <div class="execution-section">
        <div class="execution-header">
            <h3>🚀 Execution: {exec_id}</h3>
            <p>{len(exec_vizs)} visualizations</p>
        </div>
        <div class="gallery">
"""
            
            for viz in exec_vizs:
                # Convert absolute path to relative for HTML
                rel_path = os.path.relpath(viz['filepath'], experiment_dir)
                
                html_content += f"""
            <div class="viz-card">
                <img src="{rel_path}" alt="Visualization" class="viz-image">
                <div class="viz-info">
                    <strong>File:</strong> {viz['filename']}<br>
                    <strong>Cell:</strong> {viz['cell_index']}<br>
                    <strong>Created:</strong> {viz['created_at'][:19]}
                </div>
            </div>
"""
            
            html_content += """
        </div>
    </div>
"""
        
        html_content += """
</body>
</html>
"""
        
        # Save gallery
        gallery_path = experiment_dir / "visualization_gallery.html"
        with open(gallery_path, 'w') as f:
            f.write(html_content)
        
        print(f"📸 Created visualization gallery: {gallery_path}")
        return str(gallery_path)
    
    def analyze_execution_results(self, experiment_id: str, execution_id: str) -> Optional[str]:
        """Analyze execution results using AI."""
        experiment_dir = self.experiments_dir / experiment_id
        report_path = experiment_dir / "logs" / f"{execution_id}_report.json"
        
        if not report_path.exists():
            return "Execution report not found."
        
        with open(report_path, 'r') as f:
            report = json.load(f)
        
        # Create analysis prompt
        prompt = f"""Analyze this notebook execution report and provide insights:

EXECUTION SUMMARY:
- Total cells: {report['execution_summary']['total_cells']}
- Code cells: {report['execution_summary']['code_cells']}
- Cells with outputs: {report['execution_summary']['cells_with_outputs']}
- Cells with errors: {report['execution_summary']['cells_with_errors']}
- Visualizations created: {report['execution_summary']['total_visualizations']}

ERRORS FOUND:
{json.dumps(report['errors'], indent=2) if report['errors'] else 'No errors'}

VISUALIZATIONS:
{len(report['visualizations'])} visualizations were generated

Please provide:
1. Overall assessment of the execution
2. Analysis of any errors and suggested fixes
3. Insights about the visualizations created
4. Recommendations for improvement
5. Summary of key results
"""
        
        analysis = self.chat(prompt, max_tokens=1500)
        
        if analysis:
            # Save analysis
            analysis_path = experiment_dir / "analysis" / f"{execution_id}_ai_analysis.md"
            with open(analysis_path, 'w') as f:
                f.write(f"# AI Analysis for Execution {execution_id}\n\n")
                f.write(f"**Generated:** {datetime.now().isoformat()}\n\n")
                f.write(analysis)
            
            print(f"🤖 Saved AI analysis: {analysis_path}")
        
        return analysis
    
    def chat(self, message: str, model: str = "meta/llama-3.1-8b-instruct", 
             max_tokens: int = 1024, temperature: float = 0.7) -> Optional[str]:
        """Send chat message to AI model."""
        url = f"{self.base_url}/chat/completions"
        payload = {
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
        except Exception as e:
            print(f"AI request failed: {e}")
            return None

# Example usage
if __name__ == "__main__":
    # Create executor
    executor = NotebookExecutorWithVisualization(API_KEY)
    
    # Create experiment
    exp_id = executor.create_experiment(
        name="Data Visualization Test",
        description="Testing notebook execution and visualization extraction",
        tags=["visualization", "execution", "test"]
    )
    
    # Example: Execute a notebook (replace with your notebook path)
    notebook_path = "sample_notebook.ipynb"
    
    if os.path.exists(notebook_path):
        # Execute notebook and extract visualizations
        execution_result = executor.execute_notebook(
            notebook_path=notebook_path,
            experiment_id=exp_id,
            save_outputs=True,
            extract_visualizations=True
        )
        
        print(f"Execution result: {execution_result}")
        
        # Create visualization gallery
        gallery_path = executor.create_visualization_gallery(exp_id)
        print(f"Gallery created: {gallery_path}")
        
        # AI analysis of results
        if execution_result["status"] == "completed":
            analysis = executor.analyze_execution_results(
                exp_id, 
                execution_result["execution_id"]
            )
            if analysis:
                print("AI Analysis:")
                print(analysis[:500] + "..." if len(analysis) > 500 else analysis)
    else:
        print(f"Sample notebook not found: {notebook_path}")
        print("Create a notebook with some plots to test visualization extraction!")