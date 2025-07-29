#!/usr/bin/env python3
"""
Simple script to test integrated-backend endpoints
"""
import requests
import json

BASE_URL = "http://localhost:3000"

def test_health():
    """Test health check endpoint"""
    print("Testing /health endpoint...")
    try:
        response = requests.get(f"{BASE_URL}/health")
        print(f"Status: {response.status_code}")
        print(f"Response: {response.json()}")
        return response.status_code == 200
    except Exception as e:
        print(f"Error: {e}")
        return False

def test_upload():
      file_path = "/Users/jiahuajiang/Desktop/Code/Nvidia-agent/2_Linear_Regression_Housing.ipynb"
      with open(file_path, 'rb') as f:
          files = {'file': (file_path, f, 'application/json')}
          response = requests.post(f"{BASE_URL}/upload", files=files)
def test_analyze():
    notebook_analysis = requests.get(f"{BASE_URL}/analyze")
    print(notebook_analysis.json())
def test_visualization():
    visualization_response = requests.get(f"{BASE_URL}/visualize")
    print(visualization_response.json())

def test_suggestions():
    suggestions_response = requests.get(f"{BASE_URL}/suggestions")
    print(suggestions_response.json())

def test_code():
    code_response = requests.get(f"{BASE_URL}/code?topic=suggestion&option=add_data_cleaning")
    print(code_response.json())
def test_chat():
    chat_response = requests.get(f"{BASE_URL}/chat", json={"question": "What is the purpose of this notebook?"})
    print(chat_response.json())
def main():
    test_upload()

    # test_analyze()
    # test_visualization()
    # test_suggestions()
    # test_code()
    test_chat()
if __name__ == "__main__":
    main()