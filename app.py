from flask import Flask, jsonify, request, render_template
import sys
import os

import nbformat
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from new_app import NvidiaLlamaAgent
from dotenv import load_dotenv

from Experiment_Manager import ExperimentNotebookManager
_ = load_dotenv("secrets.env")
API_KEY=os.environ["API_KEY"]
app = Flask(__name__)

# manager
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
# Save MNist notebook
nminst_result = manager.save_notebook(
    notebook_path="/Users/jiahuajiang/Desktop/Code/nvidia-agent/NMIST.ipynb",
    experiment_id=exp_id,
    version_name="initial",
    notes="Initial notebook setup with templates",
    auto_analyze=True
)

# Save and analyze template notebook
save_result = manager.save_notebook(
    notebook_path=notebook_path,
    experiment_id=exp_id,
    version_name="initial",
    notes="Initial notebook setup with templates",
    auto_analyze=True
)

# Save and analyze a iris notebook
iris_result = manager.save_notebook(
    notebook_path="/Users/jiahuajiang/Desktop/Code/nvidia-agent/1_Logistic_Regression_Iris.ipynb",
    experiment_id=exp_id,
    version_name="initial",
    notes="Initial notebook setup with templates",
    auto_analyze=True
)

# save and analyze a kmeans notebook
kmeans_result = manager.save_notebook(
    notebook_path="/Users/jiahuajiang/Desktop/Code/nvidia-agent/3_KMeans_Clustering_Digits.ipynb",
    experiment_id=exp_id,
    version_name="initial",
    notes="Initial notebook setup with templates",
    auto_analyze=True
)




experiments = manager.list_experiments()
print(f"Total experiments: {len(experiments)}")
@app.route('/')
def index():
    return render_template('upload.html')


@app.route('/upload', methods=['POST'])
def upload_notebook():
    # file = request.files.get('notebook')
    # if not file or not file.filename.lower().endswith('.ipynb'):
    #     return "Please upload a .ipynb file", 400

    # content = file.read().decode('utf-8')

    # try:
    #     nb = nbformat.reads(content, as_version=4)
    # except Exception as e:
    #     return f"Failed to parse notebook: {e}", 400

    # # Set the uploaded notebook in the agent
    # agent.set_notebook_content(nb)
    
    # # Analyze the uploaded notebook
    # analysis = agent.analyze_notebook()
    
    # summary = {
    #     "filename": file.filename,
    #     "num_cells": len(nb.cells),
    #     "cells": [
    #         {"index": i, "type": cell.cell_type, "length": len(cell.source)}
    #         for i, cell in enumerate(nb.cells)
    #     ],
    #     "analysis": analysis
    # }

    return jsonify(summary)

@app.route("/chat", methods=["POST"])
def chat():
    """
    Endpoint to handle chat requests.
    Expects JSON with 'message' key.
    """
    data = request.json
    if not data or 'message' not in data:
        return jsonify({"error": "Invalid input"}), 400
    
    message = data['message']
    
    # Get response from the agent
    response = agent.chat(message)
    print(response)
    if response:
        return jsonify({"response": response})
    else:
        return jsonify({"error": "Failed to get a response"}), 500

@app.route("/analyze", methods=["GET"])
def getAnalysis():
    # manager analyze notebook
    data = request.json
    
    result = manager.analyze_notebook(
        notebook_path="/Users/jiahuajiang/Desktop/Code/nvidia-agent/NMIST.ipynb",
        experiment_id=exp_id,
        version_name="initial",
        notes="Initial notebook setup with templates"
    )
    if result:
        return jsonify({"analysis": result})
    else:
        return jsonify({"error": "Failed to analyze notebook"}), 500
    return

@app.route("/notebook", methods=["POST"])
def notebook():
    # add notebook to current session
    #process json file
    data = request.json
    if not data or 'notebook' not in data:
        return jsonify({"error": "Invalid input"}), 400
    notebook = data['notebook']
    # save notebook path
    
    return
if __name__ == "__main__":
    app.run(host='0.0.0.0', port=8000, debug=True)
