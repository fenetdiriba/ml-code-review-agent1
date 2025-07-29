from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import base64
import os
import sys
import tempfile
from datetime import datetime
from PIL import Image
import io
from pprint import pprint
# Add the parent directory to the path to import agent.py
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from agent import ML_Assistant_Agent

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

# Initialize the conversation agent
try:
    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv("../secrets.env")
    API_KEY = os.environ.get("API_KEY")
    
    if not API_KEY:
        print("❌ Error: API_KEY not found in environment variables")
        print("Please set your NVIDIA API key in secrets.env file")
        ml_agent = None
    else:
        ml_agent = ML_Assistant_Agent(API_KEY)
        print(f"✅ Backend initialized with API key: {API_KEY[:5]}...")
except Exception as e:
    print(f"❌ Error initializing backend: {e}")
    ml_agent = None

def set_up_response():
    if not ml_agent:
        return jsonify({"error": "Conversation agent not initialized"}), 500
    if ml_agent.override_context:
        return
    if not ml_agent.problem_context:
        return jsonify({"error": "Need problem context"}), 400
    if not ml_agent.data_description:
        return jsonify({"error": "Need data description"}), 400
    

def save_uploaded_file(file_data, filename):
    """Save uploaded file to temporary directory"""
    try:
        # Create temp directory if it doesn't exist
        temp_dir = "temp_uploads"
        os.makedirs(temp_dir, exist_ok=True)
        
        file_path = os.path.join(temp_dir, filename)
        with open(file_path, 'wb') as f:
            f.write(file_data)
        return file_path
    except Exception as e:
        print(f"Error saving file: {e}")
        return None
    
@app.route('/override_context', methods=['POST'])
def set_override_context():
    """Set whether to override the context for the agent"""
    if not ml_agent:
        return jsonify({"error": "Conversation agent not initialized"}), 500
    
    data = request.get_json()
    override_context = data.get("override_context", True)
    
    if not isinstance(override_context, bool):
        return jsonify({"error": "Invalid override_context value"}), 400
    
    ml_agent.override_context = override_context
    return jsonify({"message": "Override context set successfully", "override_context": ml_agent.override_context}), 200
@app.route('/problem_context', methods=['POST'])
def set_problem_context():
    """Set the problem context for the agent"""
    if not ml_agent:
        return jsonify({"error": "Conversation agent not initialized"}), 500
    
    data = request.get_json()
    problem_context = data.get("problem_context", "")
    
    if not problem_context:
        return jsonify({"error": "No problem context provided"}), 400
    
    ml_agent.problem_context = problem_context
    return jsonify({"message": "Problem context set successfully"}), 200

@app.route('/data_description', methods=['POST'])
def set_data_description():
    """Set the data description for the agent"""
    if not ml_agent:
        return jsonify({"error": "Conversation agent not initialized"}), 500
    
    data = request.get_json()
    data_description = data.get("data_description", "")
    
    if not data_description:
        return jsonify({"error": "No data description provided"}), 400
    
    ml_agent.data_description = data_description
    return jsonify({"message": "Data description set successfully"}), 200

@app.route('/suggestions', methods=['GET'])
def get_suggestions():
    """Return a list of suggestions to improve notebook machine learning architure"""
    set_up_response()
    
    try:
        if not ml_agent.current_notebook:
            return jsonify({"error": "No notebook uploaded"}), 400
        
        # Read the current notebook
        notebook_dict = ml_agent.read_notebook(ml_agent.current_notebook)
        if not notebook_dict:
            return jsonify({"error": "Failed to read notebook"}), 500
        
        # Get suggestions from the agent
        suggestions = ml_agent.get_suggestions(notebook_dict)
        return jsonify({"suggestions": suggestions}), 200
    except Exception as e:
        print(f"Error getting suggestions: {e}")
        return jsonify({"error": str(e)}), 500
   

@app.route('/analyze', methods=['GET'])
def analyze_code():
    """Give a through analysis of the code machine learning code"""
    set_up_response()
    try:
        if not ml_agent.current_notebook:
            return jsonify({"error": "No notebook uploaded"}), 400
        
        # Read the current notebook
        notebook_dict = ml_agent.read_notebook(ml_agent.current_notebook)
        if not notebook_dict:
            return jsonify({"error": "Failed to read notebook"}), 500
        
        # Analyze the notebook
        analysis = ml_agent.analyze_notebook(notebook_dict)
        return jsonify({"analysis": analysis}), 200
    except Exception as e:
        print(f"Error analyzing code: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handle ipynb notebook file uploads and set it as current notebook context for agent"""
    if not ml_agent:
        return jsonify({"error": "Conversation agent not initialized"}), 500
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part in the request"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        
        # Save the uploaded file
        file_data = file.read()
        file_path = save_uploaded_file(file_data, file.filename)
        print(f"File uploaded and saved to: {file_path}")
        if not file_path:
            return jsonify({"error": "Failed to save uploaded file"}), 500
        
        # Set the uploaded notebook as current context for the agent
        # ml_agent.problem_context = f"Uploaded notebook: {file_path}"
        ml_agent.current_notebook = file_path
        #pretty print the dict
        pprint(ml_agent.read_notebook(ml_agent.current_notebook))
        return jsonify({"message": "File uploaded successfully", "file_path": file_path}), 200
    except Exception as e:
        print(f"Error processing file upload: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/visualize', methods=['GET'])
def get_visualization_suggestions():
    """Return visualization suggestions for the uploaded notebook"""
    print("Getting visualization suggestions...")
    set_up_response()
    try:
        if not ml_agent.current_notebook:
            return jsonify({"error": "No notebook uploaded"}), 400
        
        # Read the current notebook
        notebook_dict = ml_agent.read_notebook(ml_agent.current_notebook)
        if not notebook_dict:
            return jsonify({"error": "Failed to read notebook"}), 500
        
        # Get visualization suggestions from the agent
        print("Suggesting visualizations...")
        visualizations = ml_agent.suggest_visualizations(notebook_dict)
        print(f"Visualization suggestions: {visualizations}")
        return jsonify({"visualizations": visualizations}), 200
    except Exception as e:
        print(f"Error getting visualization suggestions: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/code', methods=['GET'])
def get_generated_code():
    set_up_response()
    try:
        if not ml_agent.current_notebook:
            return jsonify({"error": "No notebook uploaded"}), 400
        chosen_topic = request.args.get("topic", "")
        chosen_option = request.args.get("option", "")
        # Read the current notebook
        notebook_dict = ml_agent.read_notebook(ml_agent.current_notebook)
        if not notebook_dict:
            return jsonify({"error": "Failed to read notebook"}), 500
        
        # Get code cells from the agent
        code_cells = ml_agent.get_code(notebook_dict, chosen_topic, chosen_option)
        return jsonify({"code_cells": code_cells}), 200
    except Exception as e:
        print(f"Error getting code cells: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/chat', methods=['GET'])
def chat_with_agent():
    """Chat with the ML assistant agent"""
    if not ml_agent:
        return jsonify({"error": "Conversation agent not initialized"}), 500
    
    data = request.get_json()
    question = data.get("question", "")
    
    if not question:
        return jsonify({"error": "No question provided"}), 400
    
    response = ml_agent.ask(question)
    return jsonify({"response": response})

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "ml_agent": ml_agent is not None,
        "timestamp": datetime.now().isoformat()
    })

if __name__ == '__main__':
    print("🚀 Starting Integrated ML Code Review Backend...")
    print(f"✅ Conversation Agent: {'Available' if ml_agent else 'Not available'}")
    print("📡 Endpoints:")
    print("  POST /analyze - Analyze code and images")
    print("  POST /chat - Chat with ML assistant")
    print("  POST /upload - Upload files")
    print("  GET /health - Health check")
    print("\n🌐 Server starting on http://localhost:3000")
    
    app.run(host='0.0.0.0', port=3000, debug=True) 