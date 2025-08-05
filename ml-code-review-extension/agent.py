from typing import Optional, List
import os
from dotenv import load_dotenv
from langchain_nvidia_ai_endpoints import ChatNVIDIA
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.chat_history import BaseChatMessageHistory
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain.output_parsers import StructuredOutputParser
from langchain.output_parsers import ResponseSchema
from langchain.prompts import PromptTemplate
from langchain.output_parsers import PydanticOutputParser
from pydantic import BaseModel
from typing import List
import nbformat
import json
import re

# Load environment variables from .env files
_ = load_dotenv("../variables.env")
_ = load_dotenv("secrets.env")
API_KEY = os.environ.get("API_KEY")

# Define a structured suggestion object
class SuggestionItem(BaseModel):
    suggestion: str
    explanation: str

# Define the overall return schema as a list of suggestions
class SuggestionsOutput(BaseModel):
    suggestions: List[SuggestionItem]

class VisualizationItem(BaseModel):
    visualization_type: str
    description: str
    why: str
    
class VisualizationOutput(BaseModel):
    visualizations: List[VisualizationItem]

class CodeOutput(BaseModel):
    code: str
    explanation: str
    cell_block: str

class AnalysisOutput(BaseModel):
    overall_assessment: str
    best_practices: str
    data_handling: str
    model_implementation: str
    visualization: str
    organization: str
    performance: str
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
            model="ai-llama-3_1-8b-instruct",  # Use the correct NVIDIA model name
            api_key=api_key,
            temperature=0.3,
            max_tokens=1024,
            nvidia_api_key=api_key  # Explicitly set the API key
        )
        
        # Initialize chat history
        self.chat_history = []

    def chat(self,
             message: str,
             model: str = "ai-llama-3_1-8b-instruct",
             max_tokens: int = 1024,
             temperature: float = 0.3) -> Optional[str]:
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
            if model != "ai-llama-3_1-8b-instruct" or max_tokens != 1024 or temperature != 0.3:
                self.llm = ChatNVIDIA(
                    model=model,
                    api_key=self.api_key,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    nvidia_api_key=self.api_key  # Explicitly set the API key
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

def validate_json_response(response: str) -> bool:
    """Validate if a response is valid JSON"""
    try:
        json.loads(response)
        return True
    except (json.JSONDecodeError, TypeError):
        return False

def clean_json_response(response: str) -> str:
    """Clean and fix malformed JSON responses"""
    try:
        # Try to parse as-is first
        json.loads(response)
        return response
    except json.JSONDecodeError:
        # Try to extract JSON from the response
        import re
        
        # Look for JSON-like content between curly braces
        json_match = re.search(r'\{.*\}', response, re.DOTALL)
        if json_match:
            try:
                json.loads(json_match.group())
                return json_match.group()
            except json.JSONDecodeError:
                pass
        
        # If no valid JSON found, return a fallback
        return response

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
            model="ai-llama-3_1-8b-instruct",  # Use the correct NVIDIA model name
            api_key=api_key,
            temperature=0.3,  # Lower temperature for more consistent JSON output
            max_tokens=1024,  # Maximum allowed token limit for ChatNVIDIA
            nvidia_api_key=api_key  # Explicitly set the API key
        )
        
        # Initialize chat history
        self.chat_history = []
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
        self.chat_history.append(system_message)

    def set_problem_context(self, context: str):
        """
        Set the problem context for the agent.

        Args:
            context (str): Description of the problem domain.
        """
        self.problem_context = context
        system_message = SystemMessage(content=f"Problem context: {context}")
        self.chat_history.append(system_message)
    def set_data_description(self, description: str):
        """
        Set the data description for the agent.

        Args:
            description (str): Description of the dataset.
        """
        self.data_description = description
        system_message = SystemMessage(content=f"Data description: {description}")
        self.chat_history.append(system_message)

    def ask(self, question: str) -> str:
        """
        Send a user question to the model, update history, and return the reply.

        Args:
            question (str): The user's input question.

        Returns:
            str: The assistant's response (or error message).
        """
        max_retries = 3
        for attempt in range(max_retries):
            try:
                # Only add context if it's not already in the question
                if "context of our problem" not in question and "data description" not in question:
                    question = question + f" The context of our problem is: {self.problem_context} and our data description is: {self.data_description}"
                
                # Add user message to history
                human_message = HumanMessage(content=question)
                self.chat_history.append(human_message)
                
                # Get all messages for context
                messages = self.chat_history
                
                # Invoke the model with full conversation history
                response = self.llm.invoke(messages)
                
                # Add AI response to history
                ai_message = AIMessage(content=response.content)
                self.chat_history.append(ai_message)
                
                return response.content

            except Exception as e:
                print(f"Error in ask method (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt == max_retries - 1:  # Last attempt
                    # Return a structured error response instead of raw error
                    error_response = {
                        "error": True,
                        "message": f"AI request failed after {max_retries} attempts",
                        "details": str(e)
                    }
                    return json.dumps(error_response)
                # Wait before retry
                import time
                time.sleep(1)

    def clear_history(self):
        """
        Reset the conversation history but keep the system message.
        """
        self.chat_history.clear()
        system_message = SystemMessage(content="""You are an AI assistant specialized in machine learning code review and analysis. 
        You help users understand, improve, and debug their ML code. Provide clear, actionable feedback and suggestions.""")
        self.chat_history.append(system_message)

    def get_history(self) -> List[dict]:
        """
        Retrieve a copy of the current conversation history.

        Returns:
            List[dict]: A list of message dicts with role and content.
        """
        history = []
        for message in self.chat_history:
            if isinstance(message, HumanMessage):
                history.append({"role": "user", "content": message.content})
            elif isinstance(message, AIMessage):
                history.append({"role": "assistant", "content": message.content})
            elif isinstance(message, SystemMessage):
                history.append({"role": "system", "content": message.content})
        return history

    # def suggest_visualizations(self, notebook_dict: dict) -> str:
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
            if not os.path.exists(file_path):
                return None
                
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
        
        notebook_string = safe_serialize(notebook_dict)
        analysis_parser = PydanticOutputParser(pydantic_object=AnalysisOutput)
        format_instructions = analysis_parser.get_format_instructions()
        # Use LangChain's parser
        prompt = PromptTemplate(
            input_variables=["notebook_string"],
            partial_variables={"format_instructions": format_instructions},
            template = """
Please analyze this Jupyter notebook for machine learning best practices:

{notebook_string}

Focus on:
1. Overall code quality assessment
2. ML-specific best practices analysis
3. Data handling and preprocessing review
4. Model implementation suggestions
5. Visualization and output improvements
6. Code organization and documentation suggestions
7. Performance and scalability considerations

IMPORTANT: You must return ONLY valid JSON in the exact format specified below. Do not include any other text, explanations, or markdown formatting.

{format_instructions}

Example of expected JSON format:
{{
    "overall_assessment": "The code is well-structured but lacks proper data preprocessing.",
    "best_practices": "Use sklearn's StandardScaler for feature scaling.",
    "data_handling": "Ensure missing values are handled before training.",
    "model_implementation": "Consider using cross-validation for model evaluation.",
    "visualization": "Add confusion matrix for classification tasks.",
    "organization": "Separate data loading and preprocessing into functions.",
    "performance": "Optimize hyperparameters using grid search."
}}

Remember: Return ONLY the JSON object, nothing else.
"""

        )
        formatted_prompt = prompt.format(notebook_string=notebook_string, format_instructions=format_instructions)
        response = self.ask(formatted_prompt)

        # Check if response is an error
        try:
            response_data = json.loads(response)
            if response_data.get("error"):
                # This is an error response, return a fallback analysis
                return AnalysisOutput(
                    overall_assessment="AI service temporarily unavailable",
                    best_practices=f"Error: {response_data.get('message', 'Unknown error')}",
                    data_handling="Please try again later",
                    model_implementation="",
                    visualization="",
                    organization="",
                    performance=""
                )
        except (json.JSONDecodeError, TypeError):
            # Not a JSON error response, proceed with normal parsing
            pass

        # Clean the response before parsing
        cleaned_response = clean_json_response(response)
        
        try:
            parsed = analysis_parser.parse(cleaned_response)
            return parsed
        except Exception as e:
            print("Analysis parsing failed:", e)
            # Return a fallback analysis instead of raw error
            return AnalysisOutput(
                overall_assessment="Unable to parse AI response",
                best_practices="The AI response could not be parsed",
                data_handling="Please try again or check your notebook format",
                model_implementation="",
                visualization="",
                organization="",
                performance=""
            )
        

    
  
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
    
    def suggest_visualizations(self, notebook_dict: dict) -> List[VisualizationItem]:
        """
        Suggest appropriate visualizations for the notebook data.
        
        Args:
            notebook_dict (dict): Description of the data
            
        Returns:
            List[VisualizationItem]: List of suggested visualizations
        """
        if not notebook_dict:
            return []

         # Extract notebook context
        old_notebook_string = "".join(self.notebook_history[:3])
        notebook_string = safe_serialize(notebook_dict)



        # Use LangChain's parser
        visualization_parser = PydanticOutputParser(pydantic_object=VisualizationOutput)

        format_instructions = visualization_parser.get_format_instructions()
        # --- Keep your existing prompt logic ---
        prompt = PromptTemplate(
            input_variables=["notebook_string", "old_notebook_string"],
            partial_variables={"format_instructions": format_instructions},
            template="""
Here are our old notebooks: {old_notebook_string}
Please suggest visualizations for the following notebook data:
{notebook_string}

Focus on:
1. Key insights that can be visualized
2. Common visualization types for ML data
3. Any specific libraries or tools to use (e.g., matplotlib, seaborn, plotly)

CRITICAL: You MUST respond with ONLY valid JSON. Do not include any other text, explanations, or markdown formatting.

{format_instructions}

IMPORTANT: Your response must be a valid JSON object. Do not include any text before or after the JSON. The response should start with {{ and end with }}.

Example of expected format:
{{
  "visualizations": [
    {{
      "visualization_type": "scatter_plot",
      "description": "Scatter plot of feature vs target variable",
      "why": "Useful for understanding relationships between features and target variable"
    }},
    {{
      "visualization_type": "histogram",
      "description": "Distribution of target variable",
      "why": "Shows the distribution and potential class imbalance"
    }}
  ]
}}
"""
        )
        formatted_prompt = prompt.format(
            notebook_string=notebook_string,
            old_notebook_string=old_notebook_string
        )
        response = self.ask(formatted_prompt)

        print("Visualization response from model:", response)
        
        # Check if response is an error
        try:
            response_data = json.loads(response)
            if response_data.get("error"):
                # This is an error response, return a fallback visualization
                return [VisualizationItem(
                    visualization_type="error",
                    description="AI service temporarily unavailable",
                    why=f"Error: {response_data.get('message', 'Unknown error')}. Please try again later."
                )]
        except (json.JSONDecodeError, TypeError):
            # Not a JSON error response, proceed with normal parsing
            pass
        
        # Clean the response before parsing
        cleaned_response = clean_json_response(response)
        print("Cleaned visualization response:", cleaned_response)
        
        try:
            parsed = visualization_parser.parse(cleaned_response)
            return parsed.visualizations  # or jsonable_encoder(parsed) if you're returning via API
        except Exception as e:
            print("Visualization parsing failed:", e)
            print("Original response:", response)
            print("Cleaned response:", cleaned_response)
            # Return a fallback visualization instead of raw error
            return [VisualizationItem(
                visualization_type="error",
                description="Unable to parse AI response",
                why="The AI response could not be parsed. Please try again or check your notebook format."
            )]


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


        # Extract notebook context
        old_notebook_string = "".join(self.notebook_history[:3])
        notebook_string = safe_serialize(notebook_dict)



        # Use LangChain's parser
        suggestion_parser = PydanticOutputParser(pydantic_object=SuggestionsOutput)

        format_instructions = suggestion_parser.get_format_instructions()

        # --- Keep your existing prompt logic ---
        prompt = PromptTemplate(
            input_variables=["notebook_string", "old_notebook_string"],
            partial_variables={"format_instructions": format_instructions},
            template="""
        Here are our old notebooks: {old_notebook_string}

        Please suggest improvements for the following notebook data:
        {notebook_string}

        Focus on:
        1. Current outputs and model architecture.
        2. ML best practices, with references to recent research.
        3. Data handling and preprocessing.
        4. Evaluation and tuning.

        CRITICAL: You MUST respond with ONLY valid JSON. Do not include any other text, explanations, or markdown formatting.

        {format_instructions}

        IMPORTANT: Your response must be a valid JSON object. Do not include any text before or after the JSON. The response should start with {{ and end with }}.

        Example of expected format:
        {{
        "suggestions": [
            {{
            "suggestion": "Use StandardScaler for feature scaling",
            "explanation": "StandardScaler normalizes features to have mean=0 and variance=1, improving model performance."
            }},
            {{
            "suggestion": "Implement cross-validation",
            "explanation": "It improves robustness by training on different subsets of the data."
            }}
        ]
        }}
        """
        )

        formatted_prompt = prompt.format(
            notebook_string=notebook_string,
            old_notebook_string=old_notebook_string
        )

        response = self.ask(formatted_prompt)

        print("Response from model:", response)
        
        # Check if response is an error
        try:
            response_data = json.loads(response)
            if response_data.get("error"):
                # This is an error response, return it as a fallback suggestion
                return [{
                    "suggestion": "AI service temporarily unavailable",
                    "explanation": f"Error: {response_data.get('message', 'Unknown error')}. Please try again later."
                }]
        except (json.JSONDecodeError, TypeError):
            # Not a JSON error response, proceed with normal parsing
            pass
        
        # Clean the response before parsing
        cleaned_response = clean_json_response(response)
        print("Cleaned response:", cleaned_response)
        
        try:
            parsed = suggestion_parser.parse(cleaned_response)
            return parsed.suggestions  # or jsonable_encoder(parsed) if you're returning via API
        except Exception as e:
            print("Parsing failed:", e)
            print("Original response:", response)
            print("Cleaned response:", cleaned_response)
            # Return a fallback suggestion instead of the raw error
            return [{
                "suggestion": "Unable to parse AI response",
                "explanation": "The AI response could not be parsed. Please try again or check your notebook format."
            }]

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
        if chosen_topic == "suggestion":
            #save the chosen suggestion and notebook history
            chosen_suggestion = chosen_option
            self.chosen_suggestion = chosen_suggestion
            self.notebook_history.append(safe_serialize(notebook_dict))
        # Extract relevant information from the notebook
        notebook_string = safe_serialize(notebook_dict)

        code_parser = PydanticOutputParser(pydantic_object=CodeOutput)
        format_instructions = code_parser.get_format_instructions()
        # Use LangChain's parser
        prompt = PromptTemplate(
            input_variables=["notebook_string", "chosen_topic", "chosen_option"],
            partial_variables={"format_instructions": format_instructions},
            template="""
        Here are our old notebooks: {notebook_string}
        Please give me our suggested code improvement for the following notebook data:
        {notebook_string}
        Focus on:
        1. The topic the user chose: {chosen_topic}
        2. The option the user chose: {chosen_option}
        3. The current notebook data

        CRITICAL: You MUST respond with ONLY valid JSON. Do not include any other text, explanations, or markdown formatting.

        {format_instructions}

        IMPORTANT: Your response must be a valid JSON object. Do not include any text before or after the JSON. The response should start with {{ and end with }}.

        Example of expected format:
        {{
            "code": "import pandas as pd\\n\\ndata = pd.read_csv('data.csv')",
            "explanation": "This code loads the dataset into a pandas DataFrame for analysis.",
            "cell_block": "1"
        }}
        """
        )
        formatted_prompt = prompt.format(
            notebook_string=notebook_string,
            chosen_topic=chosen_topic,
            chosen_option=chosen_option,
            format_instructions=format_instructions
        )
        response = self.ask(formatted_prompt)
        
        print("Code generation response from model:", response)
        
        # Check if response is an error
        try:
            response_data = json.loads(response)
            if response_data.get("error"):
                # This is an error response, return a fallback code output
                return CodeOutput(
                    code="# AI service temporarily unavailable\n# Please try again later",
                    explanation=f"Error: {response_data.get('message', 'Unknown error')}",
                    cell_block="error"
                )
        except (json.JSONDecodeError, TypeError):
            # Not a JSON error response, proceed with normal parsing
            pass
        
        # Clean the response before parsing
        cleaned_response = clean_json_response(response)
        print("Cleaned code response:", cleaned_response)
        
        try:
            parsed = code_parser.parse(cleaned_response)
            return parsed  # or jsonable_encoder(parsed) if you're returning via API
        except Exception as e:
            print("Code parsing failed:", e)
            print("Original response:", response)
            print("Cleaned response:", cleaned_response)
            # Return a fallback code output instead of raw error
            return CodeOutput(
                code="# Unable to parse AI response\n# Please try again or check your notebook format",
                explanation="The AI response could not be parsed",
                cell_block="error"
            )
        
    def chat(self, question: str) -> str:
        """
        Send a user question to the model, update history, and return the reply.

        Args:
            question (str): The user's input question.

        Returns:
            str: The assistant's response (or error message).
        """
        try:
            old_notebook_string = "".join(self.notebook_history[:3])
            notebook_dict = self.read_notebook(self.current_notebook)

            if not self.current_notebook:
                return "No notebook uploaded. Please upload a notebook first."
            notebook_string = safe_serialize(notebook_dict)
            prompt = f"""The user says: {question}
            Please provide a helpful response.
            Our current notebook is: {notebook_string}
            Here are our old notebooks: {old_notebook_string}
            """
            if self.problem_context and self.data_description:
                prompt += f" The context of our problem is: {self.problem_context} and our data description is: {self.data_description}"
            return self.ask(prompt)


        except Exception as e:
            print(f"Error in chat method: {e}")
            return "Sorry, I couldn't process your request."

    

    
        
        