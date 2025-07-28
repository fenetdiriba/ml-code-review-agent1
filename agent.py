import requests
import json
from typing import Optional, Dict, Any

class NvidiaLlamaAgent:
    def __init__(self, api_key: str):
        """
        Initialize the NVIDIA Llama Agent
        
        Args:
            api_key: Your NVIDIA API key
        """
        self.base_url = "https://integrate.api.nvidia.com/v1"
        self.api_key = api_key
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        
    def chat(self, message: str, model: str = "meta/llama-3.1-8b-instruct", 
             max_tokens: int = 512, temperature: float = 0.7) -> Optional[str]:
        """
        Send a chat message to the Llama model
        
        Args:
            message: The user message
            model: Model to use (default: meta/llama-3.1-8b-instruct)
            max_tokens: Maximum tokens in response
            temperature: Creativity level (0-1)
            
        Returns:
            Model response or None if error
        """
        url = f"{self.base_url}/chat/completions"
        
        payload = {
            "model": model,
            "messages": [
                {"role": "user", "content": message}
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=payload)
            response.raise_for_status()
            
            data = response.json()
            return data["choices"][0]["message"]["content"]
            
        except requests.exceptions.RequestException as e:
            print(f"API request failed: {e}")
            return None
        except KeyError as e:
            print(f"Unexpected response format: {e}")
            return None
    
    def chat_with_history(self, messages: list, model: str = "meta/llama-3.1-8b-instruct",
                         max_tokens: int = 512, temperature: float = 0.7) -> Optional[str]:
        """
        Chat with conversation history
        
        Args:
            messages: List of message dicts with 'role' and 'content'
            model: Model to use
            max_tokens: Maximum tokens in response
            temperature: Creativity level
            
        Returns:
            Model response or None if error
        """
        url = f"{self.base_url}/chat/completions"
        
        payload = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "stream": False
        }
        
        try:
            response = requests.post(url, headers=self.headers, json=payload)
            response.raise_for_status()
            
            data = response.json()
            return data["choices"][0]["message"]["content"]
            
        except requests.exceptions.RequestException as e:
            print(f"API request failed: {e}")
            return None
        except KeyError as e:
            print(f"Unexpected response format: {e}")
            return None

class ConversationAgent:
    def __init__(self, api_key: str):
        """
        A conversational agent that maintains chat history
        """
        self.nvidia_agent = NvidiaLlamaAgent(api_key)
        self.conversation_history = []
        
    def ask(self, question: str) -> str:
        """
        Ask a question and get a response while maintaining history
        """
        # Add user message to history
        self.conversation_history.append({"role": "user", "content": question})
        
        # Get response from model
        response = self.nvidia_agent.chat_with_history(self.conversation_history)
        
        if response:
            # Add assistant response to history
            self.conversation_history.append({"role": "assistant", "content": response})
            return response
        else:
            return "Sorry, I couldn't process your request."
    
    def clear_history(self):
        """Clear conversation history"""
        self.conversation_history = []
    
    def get_history(self):
        """Get current conversation history"""
        return self.conversation_history.copy()

# Example usage
if __name__ == "__main__":
    # Replace with your actual NVIDIA API key

    # Simple one-off chat
    agent = NvidiaLlamaAgent(API_KEY)
    response = agent.chat("Hello! Tell me a joke.")
    print("Simple chat response:", response)
    
    # Conversational agent with history
    conv_agent = ConversationAgent(API_KEY)
    
    print("\n--- Conversation Example ---")
    print("User: What's the capital of France?")
    response1 = conv_agent.ask("What's the capital of France?")
    print(f"Agent: {response1}")
    
    print("\nUser: What's the population of that city?")
    response2 = conv_agent.ask("What's the population of that city?")
    print(f"Agent: {response2}")
    
    # Show conversation history
    print("\n--- Conversation History ---")
    for msg in conv_agent.get_history():
        print(f"{msg['role'].title()}: {msg['content'][:100]}...")