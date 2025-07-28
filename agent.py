import requests  # HTTP library for API calls
import json      # JSON parsing
from typing import Optional, Dict, Any
import os
from dotenv import load_dotenv  # environment variable loader

# Load environment variables from .env files
_ = load_dotenv("../variables.env")
_ = load_dotenv("secrets.env")
API_KEY = os.environ.get("API_KEY")  # Retrieve the API key from environment

class NvidiaLlamaAgent:
    """
    Wrapper for interacting with NVIDIA's Llama chat endpoint.
    Handles authentication headers and request formatting.
    """
    def __init__(self, api_key: str):
        """
        Initialize the agent with the provided API key.

        Args:
            api_key (str): NVIDIA API key for authorization.
        """
        self.base_url = "https://integrate.api.nvidia.com/v1"
        self.api_key = api_key
        # Common headers for all requests
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        self.current_notebook = None
        self.message_history = []
        
    def set_notebook(self, notebook: str):
        """
        Set the current notebook for the agent.

        Args:
            notebook (str): Path to the notebook file.
        """
        self.current_notebook = notebook

    def analyze_notebook(self) -> Optional[str]:
        """
        Analyze the current notebook and return insights.

        Returns:
            Optional[str]: Analysis results or None if an error occurred.
        """
        # if not self.current_notebook:
        #     print("No notebook set for analysis.")
        #     return None
        import nbformat

        # Load the notebook
        with open(self.current_notebook, "r", encoding="utf-8") as f:
            nb = nbformat.read(f, as_version=4)

        cells = []

        # Access notebook cells
        for cell in nb.cells:
            if cell.cell_type == "code":
                cells.append(cell)
            elif cell.cell_type == "markdown":
                cells.append(cell)
        chat_result = self.chat("Analyze the following notebook and provide insights: " + str(cells))
        print(chat_result)
        self.message_history.append({"role": "assistant", "content": chat_result})
        # Placeholder for actual analysis logic
        # This could involve reading the notebook file, extracting code cells, etc.
        # For now, we just return a dummy response
        return chat_result

    def chat(self,
             message: str,
             model: str = "meta/llama-3.1-8b-instruct",
             max_tokens: int = 512,
             temperature: float = 0.7) -> Optional[str]:
        """
        Send a single chat message and receive a response.

        Args:
            message (str): The input message to the model.
            model (str): Model identifier (default: Llama 3.1 8B instruct).
            max_tokens (int): Maximum tokens to generate in the response.
            temperature (float): Sampling temperature (0.0–1.0).

        Returns:
            Optional[str]: The model's reply, or None if an error occurred.
        """
        # Construct request URL and payload
        url = f"{self.base_url}/chat/completions"
        payload: Dict[str, Any] = {
            "model": model,
            "messages": [{"role": "user", "content": message}],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False
        }
        try:
            # Execute the POST request
            resp = requests.post(url, headers=self.headers, json=payload)
            resp.raise_for_status()  # Raise an error for bad HTTP codes

            # Parse JSON response
            data = resp.json()
            # Extract the assistant's content field
            return data["choices"][0]["message"]["content"]

        except (requests.RequestException, KeyError) as e:
            # Print error and return None on failure
            print(f"Chat request failed: {e}")
            return None

class ConversationAgent:
    """
    Higher-level agent that preserves conversation history
    and provides utility methods for analysis workflows.
    """
    def __init__(self, api_key: str):
        """
        Initialize with a fresh history and underlying Llama agent.

        Args:
            api_key (str): NVIDIA API key.
        """
        self.nvidia_agent = NvidiaLlamaAgent(api_key)
        self.conversation_history: list = []  # Stores each turn of the conversation

    def ask(self, question: str) -> str:
        """
        Send a user question to the model, update history, and return the reply.

        Args:
            question (str): The user's input question.

        Returns:
            str: The assistant's response (or error message).
        """
        # Append user message to history
        self.conversation_history.append({"role": "user", "content": question})

        # Send the full history to the model for context
        response = self.nvidia_agent.chat(
            message=json.dumps(self.conversation_history),
            model="meta/llama-3.1-8b-instruct"
        )
        if response:
            # Save assistant's reply in history
            self.conversation_history.append({"role": "assistant", "content": response})
            return response
        # Fallback if something went wrong
        return "Sorry, I couldn't process your request."

    def clear_history(self):
        """
        Reset the conversation history to an empty list.
        """
        self.conversation_history.clear()

    def get_history(self) -> list:
        """
        Retrieve a copy of the current conversation history.

        Returns:
            list: A list of message dicts (role/content).
        """
        return self.conversation_history.copy()

    def analyze_summary(self,
                        summary_path: str,
                        model: str = "meta/llama-3.1-8b-instruct",
                        max_tokens: int = 512,
                        temperature: float = 0.7) -> Optional[str]:
        """
        Read a JSON summary file of ML results, decide which graph to plot,
        generate matplotlib code, and get feedback + accuracy stats.

        Args:
            summary_path (str): Path to the JSON summary file.
            model (str): Model identifier for analysis prompts.
            max_tokens (int): Token limit for the response.
            temperature (float): Sampling creativity.

        Returns:
            Optional[str]: Model-driven analysis and code.
        """
        # Attempt to load the JSON summary
        try:
            with open(summary_path, 'r') as f:
                summary = json.load(f)
        except (IOError, json.JSONDecodeError) as e:
            print(f"Failed to load summary: {e}")
            return None

        # Build the prompt combining user data with instructions
        prompt = (
            "I have the following JSON summary of a machine learning model's performance metrics:\n"
            f"{json.dumps(summary, indent=2)}\n"
            "Based on this summary, decide which ML graph should be plotted to best showcase the model's ability. "
            "Provide Python code using matplotlib to generate this graph. Then, give feedback on how to improve the model "
            "and include statistics on its accuracy."
        )

        # Invoke the chat endpoint with our custom prompt
        response = self.nvidia_agent.chat(
            message=prompt,
            model=model,
            max_tokens=max_tokens,
            temperature=temperature
        )
        return response

# Example usage block
if __name__ == "__main__":
    # Instantiate the conversational agent
    conv_agent = ConversationAgent(API_KEY)
    # Perform analysis on a summary JSON file
    analysis = conv_agent.analyze_summary("model_summary.json")
    print(analysis)