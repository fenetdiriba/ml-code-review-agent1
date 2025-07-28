from flask import Flask, request, jsonify, render_template_string, redirect, url_for, flash
import requests
import os
import json
from datetime import datetime
from werkzeug.utils import secure_filename
import nbformat
from nbformat import validate, ValidationError
import tempfile

app = Flask(__name__)
app.secret_key = 'forwarder_secret_key_2024'  # Change this

# Configuration
ALLOWED_EXTENSIONS = {'ipynb'}
MAX_CONTENT_LENGTH = 16 * 1024 * 1024  # 16MB max file size
DEFAULT_TARGET_SERVER = 'http://localhost:5001'  # Target Flask app URL

app.config['MAX_CONTENT_LENGTH'] = MAX_CONTENT_LENGTH

def allowed_file(filename):
    """Check if file has allowed extension"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def validate_notebook_file(file_content):
    """Validate if the content is a valid Jupyter notebook"""
    try:
        notebook = nbformat.reads(file_content, as_version=4)
        validate(notebook)
        return True, "Valid notebook"
    except ValidationError as e:
        return False, f"Invalid notebook format: {str(e)}"
    except json.JSONDecodeError as e:
        return False, f"Invalid JSON format: {str(e)}"
    except Exception as e:
        return False, f"Error reading file: {str(e)}"

def forward_notebook_to_server(file_obj, target_url, endpoint='/notebook'):
    """
    Forward notebook file to target Flask server
    
    Args:
        file_obj: File object to forward
        target_url: Base URL of target server
        endpoint: Endpoint on target server (default: /notebook)
        
    Returns:
        tuple: (success: bool, response_data: dict)
    """
    try:
        # Reset file pointer to beginning
        file_obj.seek(0)
        
        # Prepare the file for forwarding
        files = {
            'notebook': (
                file_obj.filename,
                file_obj.read(),
                'application/json'
            )
        }
        
        # Send to target server
        full_url = f"{target_url.rstrip('/')}{endpoint}"
        response = requests.post(full_url, files=files, timeout=30)
        
        if response.status_code == 200:
            try:
                return True, response.json()
            except json.JSONDecodeError:
                return True, {'message': response.text}
        else:
            return False, {
                'error': f'Target server error: {response.status_code}',
                'message': response.text
            }
            
    except requests.exceptions.Timeout:
        return False, {'error': 'Request to target server timed out'}
    except requests.exceptions.ConnectionError:
        return False, {'error': 'Could not connect to target server'}
    except Exception as e:
        return False, {'error': f'Forwarding failed: {str(e)}'}

# HTML template for upload form
UPLOAD_TEMPLATE = """
<!DOCTYPE html>
<html>
<head>
    <title>Notebook Forwarder</title>
    <style>
        body { 
            font-family: Arial, sans-serif; 
            max-width: 800px; 
            margin: 50px auto; 
            padding: 20px; 
            background-color: #f5f5f5;
        }
        .container {
            background: white;
            padding: 30px;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .upload-area { 
            border: 2px dashed #007bff; 
            padding: 40px; 
            text-align: center; 
            margin: 20px 0; 
            border-radius: 8px;
            background-color: #f8f9fa;
        }
        .upload-area:hover { border-color: #0056b3; background-color: #e9ecef; }
        .btn { 
            background: #007bff; 
            color: white; 
            padding: 12px 24px; 
            border: none; 
            border-radius: 4px; 
            cursor: pointer; 
            font-size: 16px;
        }
        .btn:hover { background: #0056b3; }
        .config-section {
            background: #e9ecef;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
        }
        .error { color: #dc3545; padding: 10px; background: #f8d7da; border-radius: 4px; margin: 10px 0; }
        .success { color: #155724; padding: 10px; background: #d4edda; border-radius: 4px; margin: 10px 0; }
        .info { color: #004085; padding: 10px; background: #cce7ff; border-radius: 4px; margin: 10px 0; }
        input[type="text"] { width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; }
        label { display: block; margin-bottom: 5px; font-weight: bold; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📓 Notebook Forwarder</h1>
        <p>Upload a Jupyter notebook to forward it to another Flask server.</p>
        
        {% with messages = get_flashed_messages(with_categories=true) %}
            {% if messages %}
                {% for category, message in messages %}
                    <div class="{{ 'success' if category == 'success' else 'error' if category == 'error' else 'info' }}">
                        {{ message }}
                    </div>
                {% endfor %}
            {% endif %}
        {% endwith %}
        
        <form method="POST" enctype="multipart/form-data">
            <div class="config-section">
                <label for="target_server">Target Server URL:</label>
                <input type="text" name="target_server" id="target_server" 
                       value="{{ request.form.get('target_server', default_target) }}" 
                       placeholder="http://localhost:5001">
                
                <br><br>
                <label for="endpoint">Target Endpoint:</label>
                <input type="text" name="endpoint" id="endpoint" 
                       value="{{ request.form.get('endpoint', '/notebook') }}" 
                       placeholder="/notebook">
            </div>
            
            <div class="upload-area">
                <input type="file" name="notebook" accept=".ipynb" required>
                <p>📁 Select a .ipynb file to upload and forward</p>
            </div>
            
            <button type="submit" class="btn">🚀 Upload & Forward Notebook</button>
        </form>
        
        <div class="config-section">
            <h3>ℹ️ How it works:</h3>
            <ol>
                <li>Upload your .ipynb file using the form above</li>
                <li>The file is validated to ensure it's a proper Jupyter notebook</li>
                <li>The notebook is forwarded to the target Flask server</li>
                <li>You'll see the response from the target server</li>
            </ol>
        </div>
    </div>
</body>
</html>
"""

@app.route('/', methods=['GET', 'POST'])
def upload_and_forward():
    """Main upload form and forwarding handler"""
    if request.method == 'POST':
        # Get target server configuration
        target_server = request.form.get('target_server', DEFAULT_TARGET_SERVER).strip()
        endpoint = request.form.get('endpoint', '/notebook').strip()
        
        if not target_server:
            flash('Please specify a target server URL', 'error')
            return redirect(request.url)
        
        # Check if file was submitted
        if 'notebook' not in request.files:
            flash('No file selected', 'error')
            return redirect(request.url)
        
        file = request.files['notebook']
        
        if file.filename == '':
            flash('No file selected', 'error')
            return redirect(request.url)
        
        if not file or not allowed_file(file.filename):
            flash('Please upload a valid .ipynb file', 'error')
            return redirect(request.url)
        
        # Read file content for validation
        file_content = file.read()
        file.seek(0)  # Reset file pointer
        
        # Validate notebook
        is_valid, message = validate_notebook_file(file_content.decode('utf-8'))
        
        if not is_valid:
            flash(f'Invalid notebook file: {message}', 'error')
            return redirect(request.url)
        
        # Forward to target server
        flash(f'📤 Forwarding {file.filename} to {target_server}{endpoint}...', 'info')
        
        success, response_data = forward_notebook_to_server(file, target_server, endpoint)
        
        if success:
            flash(f'✅ Successfully forwarded to target server!', 'success')
            if 'message' in response_data:
                flash(f'Server response: {response_data["message"]}', 'info')
            elif 'filename' in response_data:
                flash(f'Server filename: {response_data["filename"]}', 'info')
        else:
            flash(f'❌ Forwarding failed: {response_data.get("error", "Unknown error")}', 'error')
            if 'message' in response_data:
                flash(f'Server message: {response_data["message"]}', 'error')
        
        return redirect(request.url)
    
    # GET request - show form
    return render_template_string(UPLOAD_TEMPLATE, default_target=DEFAULT_TARGET_SERVER)

@app.route('/api/forward', methods=['POST'])
def api_forward():
    """
    API endpoint for programmatic notebook forwarding
    
    Expected JSON payload:
    {
        "target_server": "http://localhost:5001",
        "endpoint": "/notebook",  # optional, defaults to /notebook
        "notebook": "base64_encoded_notebook_content"  # or use multipart file upload
    }
    """
    # Handle multipart file upload
    if 'notebook' in request.files:
        file = request.files['notebook']
        target_server = request.form.get('target_server')
        endpoint = request.form.get('endpoint', '/notebook')
        
        if not file or not allowed_file(file.filename):
            return jsonify({'error': 'Invalid file type. Only .ipynb files allowed'}), 400
        
        if not target_server:
            return jsonify({'error': 'target_server is required'}), 400
        
        # Validate notebook
        file_content = file.read()
        file.seek(0)
        
        is_valid, message = validate_notebook_file(file_content.decode('utf-8'))
        if not is_valid:
            return jsonify({'error': f'Invalid notebook: {message}'}), 400
        
        # Forward to target server
        success, response_data = forward_notebook_to_server(file, target_server, endpoint)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Notebook forwarded successfully',
                'target_response': response_data
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': 'Forwarding failed',
                'details': response_data
            }), 500
    
    # Handle JSON payload
    elif request.is_json:
        data = request.get_json()
        
        if not data or 'target_server' not in data:
            return jsonify({'error': 'target_server is required'}), 400
        
        target_server = data['target_server']
        endpoint = data.get('endpoint', '/notebook')
        
        # For JSON API, you would need to implement base64 decoding
        # or other method to receive notebook content
        return jsonify({'error': 'JSON API not fully implemented. Use multipart upload.'}), 400
    
    else:
        return jsonify({'error': 'Invalid request format'}), 400

@app.route('/health')
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'notebook-forwarder',
        'timestamp': datetime.now().isoformat()
    })

@app.route('/test-target')
def test_target():
    """Test connectivity to default target server"""
    try:
        response = requests.get(f"{DEFAULT_TARGET_SERVER}/health", timeout=5)
        if response.status_code == 200:
            return jsonify({
                'status': 'success',
                'message': f'Target server {DEFAULT_TARGET_SERVER} is reachable',
                'target_response': response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text
            })
        else:
            return jsonify({
                'status': 'warning',
                'message': f'Target server responded with status {response.status_code}'
            })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': f'Cannot reach target server: {str(e)}'
        })

if __name__ == '__main__':
    print("🚀 Notebook Forwarder Server Starting...")
    print(f"📍 Server URL: http://localhost:5000")
    print(f"🎯 Default Target: {DEFAULT_TARGET_SERVER}")
    print(f"📝 Upload form: http://localhost:5000/")
    print(f"🔗 API endpoint: http://localhost:5000/api/forward")
    print(f"❤️  Health check: http://localhost:5000/health")
    print(f"🧪 Test target: http://localhost:5000/test-target")
    
    app.run(debug=True, host='0.0.0.0', port=5003)