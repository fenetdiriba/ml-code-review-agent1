#!/usr/bin/env python3
import requests
import json

def test_backend():
    base_url = "http://localhost:3000"
    
    # Test health endpoint
    try:
        print("Testing health endpoint...")
        response = requests.get(f"{base_url}/health", timeout=5)
        print(f"Health check: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Health check failed: {e}")
        return False
    
    # Test chat endpoint
    try:
        print("\nTesting chat endpoint...")
        chat_data = {"message": "Hello"}
        response = requests.post(f"{base_url}/chat", json=chat_data, timeout=10)
        print(f"Chat test: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Chat test failed: {e}")
    
    # Test upload endpoint
    try:
        print("\nTesting upload endpoint...")
        # Create a test file
        with open("test_file.txt", "w") as f:
            f.write("print('Hello from test file')")
        
        with open("test_file.txt", "rb") as f:
            files = {"file": f}
            response = requests.post(f"{base_url}/upload", files=files, timeout=30)
            
        print(f"Upload test: {response.status_code}")
        print(f"Response: {response.json()}")
    except Exception as e:
        print(f"Upload test failed: {e}")
    
    return True

if __name__ == "__main__":
    test_backend()