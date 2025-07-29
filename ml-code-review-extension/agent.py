from typing import Optional, List
import os
from dotenv import load_dotenv
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.chat_history import BaseChatMessageHistory, InMemoryChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory
import nbformat
import json
# Load environment variables from .env files
_ = load_dotenv("../variables.env")
_ = load_dotenv("secrets.env")
API_KEY = os.environ.get("API_KEY")

class NvidiaLlamaAgent:
    """
    LangChain-based wrapper for interacting with NVIDIA's Llama models.
    """
    def __init__(self, api_key: str):
        """
        Initialize the agent with the provided API key.

        Args:
            api_key (str): NVIDIA API key for authorization.
        """
        self.api_key = api_key
        os.environ["NVIDIA_API_KEY"] = api_key
        
        # Initialize the LangChain NVIDIA chat model
        self.llm = ChatNVIDIA(
            model="meta/llama-3.1-8b-instruct",
            api_key=api_key,
            temperature=0.7,
            max_tokens=512
        )
        
        # Initialize chat history
        self.chat_history = InMemoryChatMessageHistory()

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
        try:
            # Update model parameters if different from defaults
            if model != "meta/llama-3.1-8b-instruct" or max_tokens != 512 or temperature != 0.7:
                self.llm = ChatNVIDIA(
                    model=model,
                    api_key=self.api_key,
                    temperature=temperature,
                    max_tokens=max_tokens
                )
            
            # Create human message and invoke the model
            human_message = HumanMessage(content=message)
            response = self.llm.invoke([human_message])
            
            return response.content

        except Exception as e:
            print(f"Chat request failed: {e}")
            return None
def safe_serialize(obj):
    try:
        return json.dumps(obj, indent=2)
    except TypeError:
        def convert(o):
            return str(o)  # or `repr(o)` if needed
        return json.dumps(obj, indent=2, default=convert)

class ML_Assistant_Agent:
    """
    Higher-level agent that preserves conversation history
    and provides utility methods for analysis workflows using LangChain.
    """
    def __init__(self, api_key: str):
        """
        Initialize with a fresh history and underlying Llama agent.

        Args:
            api_key (str): NVIDIA API key.
        """
        self.api_key = api_key
        os.environ["NVIDIA_API_KEY"] = api_key
        
        # Initialize the LangChain NVIDIA chat model
        self.llm = ChatNVIDIA(
            model="meta/llama-3.1-8b-instruct",
            api_key=api_key,
            temperature=0.7,
            max_tokens=512
        )
        
        # Initialize chat history
        self.chat_history = InMemoryChatMessageHistory()
        self.data_description: Optional[str] = None
        self.current_notebook: Optional[str] = None
        self.current_notebook_dict: Optional[dict] = None
        self.data_description = ""
        self.problem_context: Optional[str] = ""
        self.notebook_history: List[str] = []
        self.chosen_suggestion: Optional[str] = ""
        self.override_context: bool = True

        
        # Set up system message for ML assistance
        system_message = SystemMessage(content="""You are an AI assistant specialized in machine learning code review and analysis. 
        You help users understand, improve, and debug their ML code. Provide clear, actionable feedback and suggestions.""")
        self.chat_history.add_message(system_message)

    def set_problem_context(self, context: str):
        """
        Set the problem context for the agent.

        Args:
            context (str): Description of the problem domain.
        """
        self.problem_context = context
        system_message = SystemMessage(content=f"Problem context: {context}")
        self.chat_history.add_message(system_message)
    def set_data_description(self, description: str):
        """
        Set the data description for the agent.

        Args:
            description (str): Description of the dataset.
        """
        self.data_description = description
        system_message = SystemMessage(content=f"Data description: {description}")
        self.chat_history.add_message(system_message)

    def ask(self, question: str) -> str:
        """
        Send a user question to the model, update history, and return the reply.

        Args:
            question (str): The user's input question.

        Returns:
            str: The assistant's response (or error message).
        """
        try:
            question = question + f" The context of our problem is: {self.problem_context} and our data description is: {self.data_description}"
            # Add user message to history
            human_message = HumanMessage(content=question)
            self.chat_history.add_message(human_message)
            
            # Get all messages for context
            messages = self.chat_history.messages
            
            # Invoke the model with full conversation history
            response = self.llm.invoke(messages)
            
            # Add AI response to history
            ai_message = AIMessage(content=response.content)
            self.chat_history.add_message(ai_message)
            
            return response.content

        except Exception as e:
            print(f"Error in ask method: {e}")
            return "Sorry, I couldn't process your request."

    def clear_history(self):
        """
        Reset the conversation history but keep the system message.
        """
        self.chat_history.clear()
        system_message = SystemMessage(content="""You are an AI assistant specialized in machine learning code review and analysis. 
        You help users understand, improve, and debug their ML code. Provide clear, actionable feedback and suggestions.""")
        self.chat_history.add_message(system_message)

    def get_history(self) -> List[dict]:
        """
        Retrieve a copy of the current conversation history.

        Returns:
            List[dict]: A list of message dicts with role and content.
        """
        history = []
        for message in self.chat_history.messages:
            if isinstance(message, HumanMessage):
                history.append({"role": "user", "content": message.content})
            elif isinstance(message, AIMessage):
                history.append({"role": "assistant", "content": message.content})
            elif isinstance(message, SystemMessage):
                history.append({"role": "system", "content": message.content})
        return history

    def suggest_visualizations(self, notebook_dict: dict) -> str:
        """
        Suggest appropriate visualizations for the notebook data.
        
        Args:
            notebook_dict (dict): Description of the data
            
        Returns:
            str: Visualization suggestions
        """
        if not notebook_dict:
            return "Invalid notebook data"
        # Extract relevant information from the notebook

        notebook_string = safe_serialize(notebook_dict)

        prompt = f"""Please suggest visualizations for the following notebook data:
        {notebook_string}
        Focus on:
        1. Key insights that can be visualized
        2. Common visualization types for ML data
        3. Any specific libraries or tools to use (e.g., matplotlib, seaborn, plotly)
        Provide the response in JSON format with visualization types and descriptions.
        example:
            Provide specific Python code examples using matplotlib, seaborn, or plotly.
            return response in JSON format example:
            [
                {{"visualization_type": "scatter_plot",
                 "description": "Scatter plot of feature vs target variable",
                 "why": "Useful for understanding relationships between features and target variable",
                }},
                {{
                 "visualization_type": "histogram",
                 "description": "Histogram of feature distribution",
                  "why": "Useful for understanding relationships between features and target variable"}},

                
            ]
        """

        return self.ask(prompt)
    
    def read_notebook(self, file_path: str) -> dict:
        """
        Read ipynb notebook using nbformat and return its content as a dictionary.
        
        Args:
            file_path (str): Path to the .ipynb file
            
        Returns:
            dict: Content of the notebook as a dictionary
        """
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                notebook = nbformat.read(f, as_version=4)
            return notebook
        except Exception as e:
            print(f"Error reading notebook: {e}")
            return None
    
    def analyze_notebook(self, notebook_dict: dict) -> str:
        """
        Analyze a notebook dictionary for ML best practices and suggestions.
        
        Args:
            notebook_dict (dict): Notebook dictionary from read_notebook
            
        Returns:
            str: Analysis and suggestions for the notebook
        """
        if not notebook_dict:
            return "Error: Invalid notebook data"
        
        # Extract code cells and markdown cells
        code_cells = []
        markdown_cells = []
        outputs = []
        
        for cell in notebook_dict.get('cells', []):
            if cell.get('cell_type') == 'code':
                code_cells.append(cell.get('source', ''))
            elif cell.get('cell_type') == 'markdown':
                markdown_cells.append(cell.get('source', ''))
            elif cell.get('cell_type') == 'output':
                outputs.append(cell.get('output_type', ''))
        
        # Combine all code into one string for analysis
        all_code = '\n\n'.join([''.join(cell) if isinstance(cell, list) else cell for cell in code_cells])
        
        prompt = f"""Please analyze this Jupyter notebook for machine learning best practices:

                **Code Cells ({len(code_cells)} total):**
                ```python
                {all_code}
                ```

                **Documentation:** {len(markdown_cells)} markdown cells present

                 Please provide:
                1. Overall code quality assessment
                2. ML-specific best practices analysis
                3. Data handling and preprocessing review
                4. Model implementation suggestions
                5. Visualization and output improvements
                6. Code organization and documentation suggestions
                7. Performance and scalability considerations
                Return the response in JSON format with keys for each section.
                example:
                {{
                    "overall_assessment": "The code is well-structured but lacks proper data preprocessing.",
                    "best_practices": "Use sklearn's StandardScaler for feature scaling.",
                    "data_handling": "Ensure missing values are handled before training.",
                    "model_implementation": "Consider using cross-validation for model evaluation.",
                    "visualization": "Add confusion matrix for classification tasks.",
                    "organization": "Separate data loading and preprocessing into functions.",
                    "performance": "Optimize hyperparameters using grid search."
                }}"""
        
        return self.ask(prompt)
    
  
    def set_current_notebook(self, file_path: str) -> bool:
        """
        Set the current notebook and parse it into dictionary format.
        
        Args:
            file_path (str): Path to the .ipynb file
            
        Returns:
            bool: True if successfully set, False otherwise
        """
        notebook_dict = self.read_notebook(file_path)
        if notebook_dict:
            self.current_notebook = file_path
            self.current_notebook_dict = notebook_dict
            return True
        return False
    
    def get_current_notebook_analysis(self) -> str:
        """
        Get analysis of the currently loaded notebook.
        
        Returns:
            str: Analysis of current notebook or error message
        """
        if not self.current_notebook_dict:
            return "No notebook currently loaded. Please upload a notebook first."
        
        return self.analyze_notebook(self.current_notebook_dict)
    
    def get_suggestions(self, notebook_dict: dict) -> str:
        """
        Get suggestions for improving the notebook's ML architecture.
        
        Args:
            notebook_dict (dict): Notebook dictionary from read_notebook
            
        Returns:
            str: Suggestions for improving the notebook
        """
        if not notebook_dict:
            return "Invalid notebook data"
        old_notebook_string = "".join(self.notebook_history[:3])
        # Extract relevant information from the notebook
        notebook_string = safe_serialize(notebook_dict)
        prompt = f"""
        Here are our old notebooks: {old_notebook_string}

        Please suggest improvements for the following notebook data:
        {notebook_string}
        Focus on:
        1. Focus on how the current architecture is doing in terms of the outputs
        2. ML best practices for our current problem, use very recent research
        3. Data handling and preprocessing
        4. Model implementation and evaluation
        You are an agent that return in JSON format with list of suggestions and explanations.
        ONLY return the suggestions and explanations, no other text.
        Provide the response in JSON format with keys for each suggestion.
        example:
            Provide specific Python code examples using sklearn, pandas, or numpy.
            return response in JSON format example:
            [
                {{"suggestion": "Use StandardScaler for feature scaling",
                 "explanation": "StandardScaler normalizes features to have mean=0 and variance=1, improving model performance."}},
                {{
                 "suggestion": "Implement cross-validation for model evaluation",
                 "explanation": "Cross-validation provides a more robust estimate of model performance by training on different subsets of data."}},
            ]
        """
        return self.ask(prompt)
    
    def get_code(self, notebook_dict: dict, chosen_topic: str, chosen_option) -> str:
        """
        Given our current notebook and user's chosen topic, return the code cells related to that topic. 

        Args:
            notebook_dict (dict): Notebook dictionary from read_notebook
            
        Returns:
            str: All code cells concatenated
        """
        if not notebook_dict:
            return "Invalid notebook data"
        if chosen_topic is "suggestion":
            #save the chosen suggestion and notebook history
            chosen_suggestion = chosen_option
            self.chosen_suggestion = chosen_suggestion
            self.notebook_history.append(safe_serialize(notebook_dict))
        # Extract relevant information from the notebook
        notebook_string = safe_serialize(notebook_dict)
        prompt = f"""
        Please give me our suggested code improvement for the following notebook data:
        {notebook_string}
        Focus on:
        1. The topic the user chose: {chosen_topic}
        2. The option the user chose: {chosen_option}
        3. The current notebook data
        You are an agent that return in JSON format of code in the following format and no other text:
        {{
            "code": "The code that you suggest to the user",
            "explanation": "The explanation of the code",
            "cell_block": "The cell block that the code is in by number"
        }}
        example:
            Provide specific Python code examples using sklearn, pandas, or numpy.
            return response in JSON format example:
            {{
                "code": "import pandas as pd\\n\\ndata = pd.read_csv('data.csv')",
                "explanation": "This code loads the dataset into a pandas DataFrame for analysis.",
                "cell_block": "1"  # Assuming this is the first cell in the notebook
            }}
        """
        return self.ask(prompt)

    

    
        
        