from flask import Flask, jsonify, request
import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from nvidia_agent import NvidiaLlamaAgent
from dotenv import load_dotenv
_ = load_dotenv("secrets.env")
API_KEY=os.environ["API_KEY"]
app = Flask(__name__)
#initial agent
agent = NvidiaLlamaAgent(API_KEY)

cuurent_session = []
@app.route("/chat", methods=["POST"])
def chat():
    """
    Endpoint to handle chat requests.
    Expects JSON with 'message' key.
    """
    data = request.json
    if not data or 'message' not in data:
        return jsonify({"error": "Invalid input"}), 400
    
    message = data['message']
    
    # Get response from the agent
    response = agent.chat(message)
    print(response)
    if response:
        return jsonify({"response": response})
    else:
        return jsonify({"error": "Failed to get a response"}), 500

@app.route("/summary", methods=["GET"])
def getSummary():
    return
@app.route("/notebook", methods=["POST"])
def notebook():
    # add notebook to current session
    return
if __name__ == "__main__":
    app.run(port=8000, debug=True)
