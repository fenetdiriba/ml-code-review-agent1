import requests
import json
import nbformat
from typing import Optional, Dict, Any, List
import os
import shutil
from datetime import datetime
from pathlib import Path
import uuid
from dotenv import load_dotenv

# Load environment variables
_ = load_dotenv("../variables.env")
_ = load_dotenv("secrets.env")
API_KEY = os.environ.get("API_KEY")

class ExperimentNotebookManager:
    """
    Enhanced notebook manager that can save, version, and organize experiment notebooks.
    Includes comprehensive analysis with output reading and experiment tracking.
    """
    
    def __init__(self, api_key: str, experiments_dir: str = "experiments"):
        """
        Initialize the experiment manager.
        
        Args:
            api_key (str): NVIDIA API key
            experiments_dir (str): Base directory for storing experiments
        """
        self.base_url = "https://integrate.api.nvidia.com/v1"
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
        # Experiment management
        self.experiments_dir = Path(experiments_dir)
        self.experiments_dir.mkdir(exist_ok=True)
        self.current_notebook = None
        self.current_experiment = None
        self.message_history = []
        
        # Create experiment tracking file
        self.tracking_file = self.experiments_dir / "experiment_log.json"
        self._load_experiment_log()
    
    def _load_experiment_log(self):
        """Load or create the experiment tracking log."""
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
        """Save the experiment tracking log."""
        self.experiment_log["last_updated"] = datetime.now().isoformat()
        with open(self.tracking_file, 'w') as f:
            json.dump(self.experiment_log, f, indent=2)
    
    def create_experiment(self, 
                         name: str, 
                         description: str = "",
                         tags: List[str] = None,
                         base_notebook: str = None) -> str:
        """
        Create a new experiment directory and initialize tracking.
        
        Args:
            name (str): Experiment name
            description (str): Experiment description
            tags (List[str]): Tags for categorization
            base_notebook (str): Path to base notebook to copy
            
        Returns:
            str: Experiment ID
        """
        experiment_id = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{name.replace(' ', '_')}"
        experiment_dir = self.experiments_dir / experiment_id
        experiment_dir.mkdir(exist_ok=True)
        
        # Create subdirectories
        (experiment_dir / "notebooks").mkdir(exist_ok=True)
        (experiment_dir / "outputs").mkdir(exist_ok=True)
        (experiment_dir / "analysis").mkdir(exist_ok=True)
        (experiment_dir / "data").mkdir(exist_ok=True)
        
        # Copy base notebook if provided
        base_notebook_path = None
        if base_notebook and os.path.exists(base_notebook):
            base_notebook_path = experiment_dir / "notebooks" / f"base_{Path(base_notebook).name}"
            shutil.copy2(base_notebook, base_notebook_path)
        
        # Create experiment metadata
        experiment_metadata = {
            "id": experiment_id,
            "name": name,
            "description": description,
            "tags": tags or [],
            "created": datetime.now().isoformat(),
            "status": "active",
            "base_notebook": str(base_notebook_path) if base_notebook_path else None,
            "notebooks": [],
            "analysis_results": [],
            "notes": []
        }
        
        # Save metadata
        metadata_file = experiment_dir / "experiment_metadata.json"
        with open(metadata_file, 'w') as f:
            json.dump(experiment_metadata, f, indent=2)
        
        # Update global log
        self.experiment_log["experiments"][experiment_id] = experiment_metadata
        self._save_experiment_log()
        
        self.current_experiment = experiment_id
        print(f"Created experiment: {experiment_id}")
        return experiment_id
    
    def save_notebook(self, 
                     notebook_path: str,
                     experiment_id: str = None,
                     version_name: str = None,
                     notes: str = "",
                     auto_analyze: bool = True) -> Dict[str, str]:
        """
        Save a notebook to an experiment with versioning and analysis.
        
        Args:
            notebook_path (str): Path to the notebook to save
            experiment_id (str): Target experiment ID (uses current if None)
            version_name (str): Version identifier
            notes (str): Notes about this version
            auto_analyze (bool): Whether to automatically analyze the notebook
            
        Returns:
            Dict[str, str]: Save information including paths and analysis
        """
        if not os.path.exists(notebook_path):
            raise FileNotFoundError(f"Notebook not found: {notebook_path}")
        
        # Use current experiment if none specified
        if not experiment_id:
            experiment_id = self.current_experiment
        if not experiment_id:
            raise ValueError("No experiment specified and no current experiment set")
        
        experiment_dir = self.experiments_dir / experiment_id
        if not experiment_dir.exists():
            raise ValueError(f"Experiment not found: {experiment_id}")
        
        # Generate version info
        if not version_name:
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            version_name = f"v_{timestamp}"
        
        # Create versioned filename
        original_name = Path(notebook_path).stem
        saved_filename = f"{original_name}_{version_name}.ipynb"
        saved_path = experiment_dir / "notebooks" / saved_filename
        
        # Copy notebook
        shutil.copy2(notebook_path, saved_path)
        
        # Create notebook metadata
        notebook_metadata = {
            "original_path": notebook_path,
            "saved_path": str(saved_path),
            "version_name": version_name,
            "saved_at": datetime.now().isoformat(),
            "notes": notes,
            "file_size": os.path.getsize(saved_path),
            "analysis_performed": False
        }
        
        # Perform analysis if requested
        analysis_result = None
        if auto_analyze:
            self.set_notebook(str(saved_path))
            analysis_result = self.analyze_notebook(include_outputs=True)
            if analysis_result:
                # Save analysis
                analysis_filename = f"{original_name}_{version_name}_analysis.md"
                analysis_path = experiment_dir / "analysis" / analysis_filename
                with open(analysis_path, 'w') as f:
                    f.write(f"# Analysis for {saved_filename}\n\n")
                    f.write(f"**Generated:** {datetime.now().isoformat()}\n\n")
                    f.write(f"**Notes:** {notes}\n\n")
                    f.write("## Analysis Results\n\n")
                    f.write(analysis_result)
                
                notebook_metadata["analysis_path"] = str(analysis_path)
                notebook_metadata["analysis_performed"] = True
        
        # Update experiment metadata
        metadata_file = experiment_dir / "experiment_metadata.json"
        with open(metadata_file, 'r') as f:
            experiment_metadata = json.load(f)
        
        experiment_metadata["notebooks"].append(notebook_metadata)
        if analysis_result:
            experiment_metadata["analysis_results"].append({
                "notebook_version": version_name,
                "analysis_path": notebook_metadata.get("analysis_path"),
                "generated_at": datetime.now().isoformat()
            })
        
        with open(metadata_file, 'w') as f:
            json.dump(experiment_metadata, f, indent=2)
        
        # Update global log
        self.experiment_log["experiments"][experiment_id] = experiment_metadata
        self._save_experiment_log()
        
        result = {
            "experiment_id": experiment_id,
            "version_name": version_name,
            "saved_path": str(saved_path),
            "analysis_performed": notebook_metadata["analysis_performed"]
        }
        
        if analysis_result:
            result["analysis_path"] = notebook_metadata["analysis_path"]
            result["analysis_preview"] = analysis_result[:500] + "..." if len(analysis_result) > 500 else analysis_result
        
        print(f"Notebook saved: {saved_filename}")
        return result
    
    def create_notebook_from_template(self, 
                                    experiment_id: str,
                                    template_type: str = "basic_ml",
                                    name: str = "experiment_notebook") -> str:
        """
        Create a new notebook from a template for an experiment.
        
        Args:
            experiment_id (str): Target experiment ID
            template_type (str): Type of template ('basic_ml', 'data_analysis', 'deep_learning')
            name (str): Notebook name
            
        Returns:
            str: Path to created notebook
        """
        templates = {
            "basic_ml": {
                "cells": [
                    {
                        "cell_type": "markdown",
                        "source": f"# {name}\n\n**Experiment:** {experiment_id}\n**Created:** {datetime.now().isoformat()}\n\n## Objective\n\n[Describe your experiment objective here]\n\n## Methodology\n\n[Describe your approach here]"
                    },
                    {
                        "cell_type": "code",
                        "source": "# Import libraries\nimport pandas as pd\nimport numpy as np\nimport matplotlib.pyplot as plt\nimport seaborn as sns\nfrom sklearn.model_selection import train_test_split\nfrom sklearn.metrics import accuracy_score, classification_report\n\n# Set random seed for reproducibility\nnp.random.seed(42)\n\nprint('Environment setup complete')"
                    },
                    {
                        "cell_type": "markdown",
                        "source": "## Data Loading and Exploration"
                    },
                    {
                        "cell_type": "code",
                        "source": "# Load your data here\n# data = pd.read_csv('your_data.csv')\n\n# Basic data exploration\n# print(f'Data shape: {data.shape}')\n# print(data.head())\n# print(data.info())"
                    },
                    {
                        "cell_type": "markdown",
                        "source": "## Model Training"
                    },
                    {
                        "cell_type": "code",
                        "source": "# Train your model here\n# X = data.drop('target', axis=1)\n# y = data['target']\n# X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)\n\n# model = YourModel()\n# model.fit(X_train, y_train)"
                    },
                    {
                        "cell_type": "markdown",
                        "source": "## Results and Evaluation"
                    },
                    {
                        "cell_type": "code",
                        "source": "# Evaluate your model\n# predictions = model.predict(X_test)\n# accuracy = accuracy_score(y_test, predictions)\n# print(f'Accuracy: {accuracy:.4f}')\n# print(classification_report(y_test, predictions))"
                    },
                    {
                        "cell_type": "markdown",
                        "source": "## Conclusions\n\n[Summarize your findings and next steps here]"
                    }
                ]
            },
            "data_analysis": {
                "cells": [
                    {
                        "cell_type": "markdown",
                        "source": f"# Data Analysis: {name}\n\n**Experiment:** {experiment_id}\n**Created:** {datetime.now().isoformat()}"
                    },
                    {
                        "cell_type": "code",
                        "source": "import pandas as pd\nimport numpy as np\nimport matplotlib.pyplot as plt\nimport seaborn as sns\nfrom scipy import stats\n\nplt.style.use('seaborn-v0_8')\nsns.set_palette('husl')"
                    },
                    {
                        "cell_type": "markdown",
                        "source": "## Data Loading"
                    },
                    {
                        "cell_type": "code",
                        "source": "# Load and examine data\n# df = pd.read_csv('data.csv')\n# df.head()"
                    }
                ]
            }
        }
        
        if template_type not in templates:
            template_type = "basic_ml"
        
        # Create notebook structure
        notebook = nbformat.v4.new_notebook()
        
        for cell_data in templates[template_type]["cells"]:
            if cell_data["cell_type"] == "markdown":
                cell = nbformat.v4.new_markdown_cell(cell_data["source"])
            else:
                cell = nbformat.v4.new_code_cell(cell_data["source"])
            notebook.cells.append(cell)
        
        # Save notebook
        experiment_dir = self.experiments_dir / experiment_id
        notebook_path = experiment_dir / "notebooks" / f"{name}.ipynb"
        
        with open(notebook_path, 'w') as f:
            nbformat.write(notebook, f)
        
        print(f"Created notebook: {notebook_path}")
        return str(notebook_path)
    
    def list_experiments(self) -> List[Dict]:
        """List all experiments with summary information."""
        experiments = []
        for exp_id, exp_data in self.experiment_log["experiments"].items():
            summary = {
                "id": exp_id,
                "name": exp_data["name"],
                "description": exp_data["description"],
                "created": exp_data["created"],
                "status": exp_data["status"],
                "notebook_count": len(exp_data["notebooks"]),
                "tags": exp_data["tags"]
            }
            experiments.append(summary)
        
        return sorted(experiments, key=lambda x: x["created"], reverse=True)
    
    def get_experiment_summary(self, experiment_id: str) -> Dict:
        """Get detailed summary of an experiment."""
        if experiment_id not in self.experiment_log["experiments"]:
            raise ValueError(f"Experiment not found: {experiment_id}")
        
        return self.experiment_log["experiments"][experiment_id]
    
    def compare_notebook_versions(self, experiment_id: str, version1: str, version2: str) -> Optional[str]:
        """Compare two versions of notebooks in an experiment."""
        exp_data = self.experiment_log["experiments"].get(experiment_id)
        if not exp_data:
            return "Experiment not found"
        
        # Find the notebooks
        nb1_data = next((nb for nb in exp_data["notebooks"] if nb["version_name"] == version1), None)
        nb2_data = next((nb for nb in exp_data["notebooks"] if nb["version_name"] == version2), None)
        
        if not nb1_data or not nb2_data:
            return "One or both versions not found"
        
        # Read both notebooks
        with open(nb1_data["saved_path"], 'r') as f:
            nb1 = nbformat.read(f, as_version=4)
        with open(nb2_data["saved_path"], 'r') as f:
            nb2 = nbformat.read(f, as_version=4)
        
        # Basic comparison
        comparison = f"""# Notebook Version Comparison
        
## Version {version1} vs Version {version2}

**{version1}:**
- Saved: {nb1_data['saved_at']}
- Cells: {len(nb1.cells)}
- Notes: {nb1_data['notes']}

**{version2}:**
- Saved: {nb2_data['saved_at']}
- Cells: {len(nb2.cells)}
- Notes: {nb2_data['notes']}

## Cell Count Comparison:
- {version1}: {len(nb1.cells)} cells
- {version2}: {len(nb2.cells)} cells
- Difference: {len(nb2.cells) - len(nb1.cells)} cells

"""
        
        # Use AI to analyze differences
        prompt = f"""Compare these two notebook versions and highlight key differences:

Version 1 ({version1}):
{json.dumps([cell.source for cell in nb1.cells[:5]], indent=2)}

Version 2 ({version2}):
{json.dumps([cell.source for cell in nb2.cells[:5]], indent=2)}

Provide insights on what changed between versions."""
        
        ai_comparison = self.chat(prompt)
        if ai_comparison:
            comparison += f"\n## AI Analysis:\n{ai_comparison}"
        
        return comparison
    
    def set_notebook(self, notebook_path: str):
        """Set the current notebook for analysis."""
        self.current_notebook = notebook_path
    
    def analyze_notebook(self, include_outputs: bool = True) -> Optional[str]:
        """Analyze the current notebook (same as previous implementation)."""
        if not self.current_notebook:
            return "No notebook set for analysis"
        
        try:
            with open(self.current_notebook, "r", encoding="utf-8") as f:
                nb = nbformat.read(f, as_version=4)
        except Exception as e:
            return f"Error reading notebook: {e}"
        
        # Extract content and analyze (simplified version)
        cells_content = []
        for i, cell in enumerate(nb.cells):
            if cell.cell_type == "code":
                cell_info = f"Cell {i+1} (code):\n{cell.source}"
                if include_outputs and hasattr(cell, 'outputs') and cell.outputs:
                    for output in cell.outputs:
                        if output.output_type == 'stream' and hasattr(output, 'text'):
                            cell_info += f"\nOutput: {output.text[:200]}"
                        elif output.output_type == 'error':
                            cell_info += f"\nError: {getattr(output, 'ename', '')}: {getattr(output, 'evalue', '')}"
                cells_content.append(cell_info)
        
        prompt = f"""Analyze this Jupyter notebook:

{chr(10).join(cells_content[:10])}  # Limit to first 10 cells

Provide insights on:
1. Code quality and structure
2. Any errors or issues
3. Results and outputs
4. Suggestions for improvement
"""
        
        return self.chat(prompt)
    
    def chat(self, message: str, model: str = "meta/llama-3.1-8b-instruct", 
             max_tokens: int = 1024, temperature: float = 0.7) -> Optional[str]:
        """Send a chat message and receive a response."""
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
            print(f"Chat request failed: {e}")
            return None

# Example usage
if __name__ == "__main__":
    # Create experiment manager
    manager = ExperimentNotebookManager(API_KEY, "my_experiments")
    
    # Create a new experiment
    exp_id = manager.create_experiment(
        name="ML Model Comparison",
        description="Comparing different classification algorithms",
        tags=["classification", "comparison", "ml"]
    )
    
    # Create a notebook from template
    notebook_path = manager.create_notebook_from_template(
        experiment_id=exp_id,
        template_type="basic_ml",
        name="model_comparison_v1"
    )
    
    # Save and analyze a notebook
    save_result = manager.save_notebook(
        notebook_path=notebook_path,
        experiment_id=exp_id,
        version_name="initial",
        notes="Initial notebook setup with templates",
        auto_analyze=True
    )

        # Save and analyze a notebook
    iris_result = manager.save_notebook(
        notebook_path="/Users/jiahuajiang/Desktop/Code/nvidia-agent/1_Logistic_Regression_Iris.ipynb",
        experiment_id=exp_id,
        version_name="initial",
        notes="Initial notebook setup with templates",
        auto_analyze=True
    )
    
    print(f"Saved notebook: {save_result}")
    print(f"Saved iris notebook: {iris_result}")
    # List all experiments
    experiments = manager.list_experiments()
    print(f"Total experiments: {len(experiments)}")