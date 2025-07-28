# ML Code Review Buddy VS Code Extension

A comprehensive VS Code extension for ML developers that provides AI-powered code analysis, interactive chat assistance, and notebook review capabilities.

## Features

### 📓 Jupyter Notebook Analysis
- **Parse Notebooks**: Automatically read and extract code/markdown cells from .ipynb files
- **Code Analysis**: Send notebook code to backend AI for comprehensive review
- **Results Display**: View analysis results in a dedicated webview panel

### 💬 Interactive Chat Assistant
- **AI Chat Interface**: Real-time conversation with ML code review assistant
- **Contextual Help**: Ask questions about ML best practices, code optimization, and debugging
- **Persistent Sessions**: Message history maintained during VS Code session
- **Modern UI**: Clean chat interface with user/assistant message bubbles

### 🖼️ Image Analysis
- **Image Upload**: Select and upload images for AI analysis
- **Multi-modal Analysis**: Combine code and image analysis for comprehensive insights
- **Supported Formats**: PNG, JPG, JPEG, GIF, BMP

### 🔧 Backend Integration
- **RESTful API**: Seamless communication with backend analysis services
- **Error Handling**: Graceful error handling with user-friendly messages
- **Flexible Endpoints**: Support for both analysis and chat API endpoints

## Commands

| Command | Description | Access |
|---------|-------------|--------|
| `ML Code Review: Analyze Notebook` | Analyze Jupyter notebook code | Right-click .ipynb file or Command Palette |
| `ML Code Review: Upload Image for Analysis` | Select image for analysis | Command Palette |
| `ML Code Review: Open Chat Assistant` | Open interactive chat panel | Command Palette |

## Quick Start

### 1. Installation & Setup
```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Launch extension development host
# Press F5 in VS Code
```

### 2. Backend Requirements
Your backend server should run on `http://localhost:3000` with these endpoints:

**Analysis Endpoint** (`POST /analyze`):
```json
{
  "code": "string",
  "image": "base64_string" // optional
}
```

**Chat Endpoint** (`POST /chat`):
```json
{
  "message": "string",
  "context": "optional context object"
}
```

### 3. Usage Examples

**Analyze a Notebook:**
1. Open any .ipynb file
2. Right-click → "ML Code Review: Analyze Notebook"
3. View results in the analysis panel

**Start Chatting:**
1. Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
2. Run "ML Code Review: Open Chat Assistant"
3. Ask questions like:
   - "How can I optimize this neural network?"
   - "What are best practices for data preprocessing?"
   - "Review my model architecture"

**Upload Images:**
1. Command Palette → "ML Code Review: Upload Image for Analysis"
2. Select image file
3. Use in subsequent notebook analysis

## Testing

Use the included `sample-notebook.ipynb` to test all functionality:
- Load the notebook
- Run analysis command
- Open chat and ask about the sample code
- Upload test images

## Extension Architecture

```
src/extension.ts
├── NotebookReader     # Parse .ipynb files
├── BackendAPI         # HTTP client for analysis/chat
├── ChatPanel          # Interactive chat interface
└── Commands           # VS Code command handlers
```

## Development

### Project Structure
```
ml-code-review-extension/
├── src/extension.ts          # Main extension code
├── package.json             # Extension manifest
├── tsconfig.json           # TypeScript config
├── sample-notebook.ipynb   # Test notebook
└── out/                   # Compiled JavaScript
```

### Key Classes
- **NotebookReader**: Parses Jupyter notebooks and extracts cells
- **BackendAPI**: Handles HTTP requests to analysis and chat endpoints  
- **ChatPanel**: Manages webview-based chat interface
- **Command Handlers**: Process VS Code commands and user interactions

## Requirements

- **VS Code**: Version 1.74.0 or higher
- **Node.js**: For dependency management and compilation
- **Backend Service**: Running on localhost:3000 with `/analyze` and `/chat` endpoints

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with F5 development host
5. Submit a pull request

## License

ISC License