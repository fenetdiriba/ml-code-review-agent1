from flask import Flask, request, render_template, jsonify
import nbformat

app = Flask(__name__)

@app.route('/')
def index():
    # Show the upload form
    return render_template('upload.html')

@app.route('notebook', methods=['POST'])
def upload_notebook():
    # 1. Get the uploaded file
    file = request.files.get('notebook')
    if not file or not file.filename.lower().endswith('.ipynb'):
        return "Please upload a .ipynb file", 400

    # 2. Read raw JSON
    content = file.read().decode('utf-8')

    # 3. Parse with nbformat
    try:
        nb = nbformat.reads(content, as_version=4)
    except Exception as e:
        return f"Failed to parse notebook: {e}", 400

    # 4. Build a summary
    summary = {
        "filename": file.filename,
        "num_cells": len(nb.cells),
        "cells": [
            {"index": i, "type": cell.cell_type, "length": len(cell.source)}
            for i, cell in enumerate(nb.cells)
        ]
    }

    # 5. Return JSON
    return jsonify(summary)


if __name__ == '__main__':
    # For local testing; remove debug=True in production
    app.run(host='0.0.0.0', port=5000, debug=True)
