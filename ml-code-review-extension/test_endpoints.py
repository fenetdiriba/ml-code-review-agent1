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
    """Test file upload endpoint"""
    print("Testing /upload endpoint...")
    try:
        file_path = "/Users/josephsackitey/Desktop/Nvidia-agent/ml-code-review-extension/temp_uploads/2_Linear_Regression_Housing.ipynb"
        with open(file_path, 'rb') as f:
            files = {'file': (file_path, f, 'application/json')}
            response = requests.post(f"{BASE_URL}/upload", files=files)
            print(f"Upload Status: {response.status_code}")
            print(f"Upload Response: {response.json()}")
            return response.status_code == 200
    except Exception as e:
        print(f"Upload Error: {e}")
        return False

def test_analyze():
    """Test analyze endpoint"""
    print("\nTesting /analyze endpoint...")
    try:
        notebook_analysis = requests.get(f"{BASE_URL}/analyze")
        print(f"Analyze Status: {notebook_analysis.status_code}")
        print(f"Analyze Response: {notebook_analysis.json()}")
        return notebook_analysis.status_code == 200
    except Exception as e:
        print(f"Analyze Error: {e}")
        return False

def test_visualization():
    """Test visualization endpoint"""
    print("\nTesting /visualize endpoint...")
    try:
        visualization_response = requests.get(f"{BASE_URL}/visualize")
        print(f"Visualize Status: {visualization_response.status_code}")
        print(f"Visualize Response: {visualization_response.json()}")
        return visualization_response.status_code == 200
    except Exception as e:
        print(f"Visualize Error: {e}")
        return False

def test_suggestions():
    """Test suggestions endpoint"""
    print("\nTesting /suggestions endpoint...")
    try:
        suggestions_response = requests.get(f"{BASE_URL}/suggestions")
        print(f"Suggestions Status: {suggestions_response.status_code}")
        print(f"Suggestions Response: {suggestions_response.json()}")
        return suggestions_response.status_code == 200
    except Exception as e:
        print(f"Suggestions Error: {e}")
        return False

def test_code():
    """Test code generation endpoint"""
    print("\nTesting /code endpoint...")
    try:
        code_response = requests.get(f"{BASE_URL}/code?topic=suggestion&option=add_data_cleaning")
        print(f"Code Status: {code_response.status_code}")
        print(f"Code Response: {code_response.json()}")
        return code_response.status_code == 200
    except Exception as e:
        print(f"Code Error: {e}")
        return False

def test_chat():
    """Test chat endpoint"""
    print("\nTesting /chat endpoint...")
    try:
        chat_response = requests.get(f"{BASE_URL}/chat?question=What is the purpose of this notebook?")
        print(f"Chat Status: {chat_response.status_code}")
        print(f"Chat Response: {chat_response.json()}")
        return chat_response.status_code == 200
    except Exception as e:
        print(f"Chat Error: {e}")
        return False

def main():
    """Run all endpoint tests"""
    print("=== API Endpoint Testing ===")
    
    # Test health first
    if not test_health():
        print("❌ Health check failed - server may not be running")
        return
    
    # Test upload
    if not test_upload():
        print("❌ Upload failed - subsequent tests may fail")
        return
    
    # Test other endpoints
    test_analyze()
    test_visualization()
    test_suggestions()
    test_code()
    test_chat()
    
    print("\n=== Testing Complete ===")
if __name__ == "__main__":
    main()
