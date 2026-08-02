# ML Code Review Buddy (Nvidia-agent)

A VS Code extension that reviews machine learning code in Jupyter notebooks and gives live, actionable feedback — powered by NVIDIA's hosted LLM endpoints (via LangChain).

Instead of manually re-reading a notebook cell by cell, this tool watches your notebook, sends its contents to an LLM-backed agent, and surfaces suggestions, visualizations to try, and generated code snippets directly in a VS Code side panel.

## What it does

- **Monitors your notebook** as you work (`notebookMonitor.ts`) and extracts context — cells, variables, data shape — for the agent to reason about (`notebookAnalyzer.ts`, `variableInspector.ts`).
- **Analyzes your ML code** across seven dimensions: overall assessment, best practices, data handling, model implementation, visualization, code organization, and performance.
- **Suggests improvements** with an explanation for each one (e.g. "use `StandardScaler`" → why it helps your specific pipeline).
- **Recommends visualizations** tailored to your data and model, with reasoning for why each one is useful.
- **Generates code** on request for a given topic (e.g. "add cross-validation") and hands back a ready-to-paste cell.
- **Chat interface** inside the VS Code panel for free-form questions about your notebook.

## How it's built

**Extension (TypeScript, VS Code API)**
- `extension.ts` — activation and command registration
- `notebookMonitor.ts` / `notebookAnalyzer.ts` — watches and parses the active notebook
- `chatPanel/` — webview UI, message handling, file upload, variable inspection
- `backendAPI.ts` — talks to the Python backend over HTTP

**Backend (Python, Flask)**
- `server.py` — REST API (`/upload`, `/analyze`, `/suggestions`, `/visualize`, `/code`, `/chat`, `/health`)
- `agent.py` — `ML_Assistant_Agent`, built on LangChain's `ChatNVIDIA` integration, with Pydantic-typed structured outputs (`AnalysisOutput`, `SuggestionsOutput`, `VisualizationOutput`, `CodeOutput`) so the LLM's response comes back as validated, predictable JSON rather than free text
- Includes JSON-repair logic (`clean_json_response`) to recover structured output when the model wraps it in markdown or extra text
- Falls back to a small set of mock suggestions if the NVIDIA API is unavailable, so the extension degrades gracefully instead of breaking

**Experiments**
- `my_experiments/` — logged experiments comparing ML model choices, tracked via a simple JSON experiment log

## Setup

1. Clone the repo and `cd ml-code-review-extension`
2. Install Python deps: `pip install -r requirements.txt`
3. Copy `secrets.env.template` → `secrets.env` and add your NVIDIA API key (`API_KEY=...`)
4. Start the backend: `python server.py` (runs on `localhost:3000`)
5. Install extension deps: `npm install`, then `npm run compile`
6. Launch the extension in VS Code's Extension Development Host (F5), then run **"Open Chat Assistant"** from the command palette

## Status

Actively evolving — the API surface above (`/analyze`, `/suggestions`, `/visualize`, `/code`, `/chat`) is implemented and wired end-to-end from the VS Code panel to the NVIDIA-backed agent. Known rough edges: the suggestions endpoint currently falls back to mock data more often than intended when the upstream model returns malformed JSON, and there's no test suite yet beyond `test_endpoints.py`.

## Roadmap

- [ ] Tighten structured-output reliability (reduce reliance on the mock-suggestion fallback)
- [ ] Add automated tests for the Flask endpoints
- [ ] Support additional notebook formats / IDEs beyond VS Code
- [ ] Publish the extension to the VS Code Marketplace
