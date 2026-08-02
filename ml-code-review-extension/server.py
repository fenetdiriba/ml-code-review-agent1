from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv
from agent import ML_Assistant_Agent
import tempfile
import json
from pydantic import BaseModel

# Load environment variables
load_dotenv("../secrets.env")

app = Flask(__name__)
CORS(app)

def serialize_pydantic_model(obj):
    """Convert Pydantic model to dictionary for JSON serialization"""
    if isinstance(obj, BaseModel):
        return obj.dict()
    elif hasattr(obj, '__dict__'):
        return obj.__dict__
    else:
        return str(obj)

# Initialize the AI agent
api_key = os.environ.get("API_KEY")
if not api_key:
    print("Warning: No API_KEY found in environment variables")
    agent = None
else:
    agent = ML_Assistant_Agent(api_key)

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "agent_available": agent is not None,
        "api_key_configured": api_key is not None
    })

@app.route('/upload', methods=['POST'])
def upload_file():
    """Handle file uploads"""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file provided"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Save file temporarily
        temp_dir = "temp_uploads"
        os.makedirs(temp_dir, exist_ok=True)
        file_path = os.path.join(temp_dir, file.filename)
        file.save(file_path)
        
        # Set the uploaded file as current notebook
        if agent:
            success = agent.set_current_notebook(file_path)
            if success:
                return jsonify({
                    "success": True,
                    "message": f"File {file.filename} uploaded successfully",
                    "file_path": file_path
                })
            else:
                return jsonify({"error": "Failed to process notebook"}), 500
        else:
            return jsonify({"error": "AI agent not available"}), 500
            
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/analyze', methods=['GET', 'POST'])
def analyze_notebook():
    """Analyze the current notebook"""
    try:
        if not agent:
            return jsonify({"error": "AI agent not available"}), 500
        
        if not agent.current_notebook_dict:
            return jsonify({"error": "No notebook uploaded"}), 400
        
        analysis = agent.analyze_notebook(agent.current_notebook_dict)
        return jsonify(serialize_pydantic_model(analysis))
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/suggestions', methods=['GET'])
def get_suggestions():
    """Get improvement suggestions"""
    try:
        if not agent:
            return jsonify({"error": "AI agent not available"}), 500
        
        if not agent.current_notebook_dict:
            return jsonify({"error": "No notebook uploaded"}), 400
        
        # For now, return mock suggestions to test the extension
        mock_suggestions = [
            {
                "suggestion": "Use StandardScaler for feature scaling",
                "explanation": "StandardScaler normalizes features to have mean=0 and variance=1, improving model performance."
            },
            {
                "suggestion": "Implement cross-validation",
                "explanation": "Cross-validation improves robustness by training on different subsets of the data."
            },
            {
                "suggestion": "Add early stopping to prevent overfitting",
                "explanation": "Early stopping monitors validation loss and stops training when it starts increasing."
            },
            {
                "suggestion": "Use feature importance analysis",
                "explanation": "Analyze which features contribute most to model predictions to improve interpretability."
            }
        ]
        
        # Try to get real suggestions if possible
        try:
            suggestions = agent.get_suggestions(agent.current_notebook_dict)
            
            # Check if suggestions is a string (error message) or contains error information
            if isinstance(suggestions, str):
                print(f"API returned error string: {suggestions}")
                # Return mock suggestions if API returns error string
                return jsonify({"suggestions": mock_suggestions})
            
            # Check if suggestions is a list and contains error information
            if isinstance(suggestions, list) and len(suggestions) > 0:
                first_suggestion = suggestions[0]
                if isinstance(first_suggestion, dict) and "AI service temporarily unavailable" in first_suggestion.get("suggestion", ""):
                    print("API returned error suggestion, using mock suggestions")
                    return jsonify({"suggestions": mock_suggestions})
            
            # If we get here, suggestions should be valid
            if suggestions:
                # Handle both list of dicts and Pydantic models
                if isinstance(suggestions, list):
                    serialized_suggestions = [serialize_pydantic_model(s) if hasattr(s, 'dict') else s for s in suggestions]
                else:
                    serialized_suggestions = serialize_pydantic_model(suggestions)
                return jsonify({"suggestions": serialized_suggestions})
                
        except Exception as api_error:
            print(f"API error, using mock suggestions: {api_error}")
        
        # Return mock suggestions if API fails
        return jsonify({"suggestions": mock_suggestions})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/visualize', methods=['GET'])
def get_visualizations():
    """Get visualization suggestions"""
    try:
        if not agent:
            return jsonify({"error": "AI agent not available"}), 500
        
        if not agent.current_notebook_dict:
            return jsonify({"error": "No notebook uploaded"}), 400
        
        visualizations = agent.suggest_visualizations(agent.current_notebook_dict)
        # Handle both list of Pydantic models and other types
        if isinstance(visualizations, list):
            serialized_visualizations = [serialize_pydantic_model(v) if hasattr(v, 'dict') else v for v in visualizations]
        else:
            serialized_visualizations = serialize_pydantic_model(visualizations)
        return jsonify({"visualizations": serialized_visualizations})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/code', methods=['GET'])
def generate_code():
    """Generate code based on topic and option"""
    try:
        if not agent:
            return jsonify({"error": "AI agent not available"}), 500
        
        if not agent.current_notebook_dict:
            return jsonify({"error": "No notebook uploaded"}), 400
        
        topic = request.args.get('topic', '')
        option = request.args.get('option', '')
        
        if not topic or not option:
            return jsonify({"error": "Topic and option parameters required"}), 400
        
        code_result = agent.get_code(agent.current_notebook_dict, topic, option)
        return jsonify(serialize_pydantic_model(code_result))
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/notebook-analysis', methods=['POST'])
def notebook_analysis():
    """Handle notebook analysis from extension"""
    try:
        if not agent:
            return jsonify({"error": "AI agent not available"}), 500
        
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        # Log the received analysis data
        print(f"Received notebook analysis: {data}")
        
        # For now, just acknowledge receipt
        # In the future, this could trigger additional processing
        return jsonify({
            "success": True,
            "message": "Notebook analysis received",
            "timestamp": data.get('timestamp', '')
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/chat', methods=['GET'])
def chat():
    """Handle chat messages"""
    try:
        if not agent:
            return jsonify({"error": "AI agent not available"}), 500
        
        question = request.args.get('question', '')
        if not question:
            return jsonify({"error": "Question parameter required"}), 400
        
        response = agent.chat(question)
        return jsonify({"response": response})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    debug_mode = os.environ.get("FLASK_DEBUG", "false").lower() == "true"
    print("Starting ML Code Review Backend Server...")
    print(f"API Key configured: {api_key is not None}")
    print(f"Agent initialized: {agent is not None}")
    print(f"Debug mode: {debug_mode}")
    app.run(host='0.0.0.0', port=3000, debug=debug_mode)
