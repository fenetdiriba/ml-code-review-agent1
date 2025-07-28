const http = require('http');
const url = require('url');

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url === '/analyze') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('Received analysis request:');
        console.log('- Code length:', data.code ? data.code.length : 0, 'characters');
        console.log('- Has image:', !!data.image);
        
        // Mock analysis response
        const analysis = {
          summary: "Mock analysis completed successfully",
          codeQuality: {
            score: 85,
            issues: [
              "Consider adding more comments to complex functions",
              "Variable names could be more descriptive"
            ]
          },
          mlBestPractices: {
            score: 90,
            suggestions: [
              "Good use of train/test split",
              "Consider adding cross-validation",
              "Data preprocessing looks appropriate"
            ]
          },
          performance: {
            score: 75,
            recommendations: [
              "Consider using more efficient data structures",
              "Vectorization could improve performance"
            ]
          },
          timestamp: new Date().toISOString()
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(analysis));
      } catch (error) {
        console.error('Error parsing request:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else if (req.method === 'POST' && req.url === '/chat') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log('Received chat message:');
        console.log('- Message:', data.message);
        console.log('- Context:', data.context ? 'provided' : 'none');
        
        // Mock chat response
        const chatResponse = {
          response: generateChatResponse(data.message),
          timestamp: new Date().toISOString()
        };
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(chatResponse));
      } catch (error) {
        console.error('Error parsing chat request:', error);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

function generateChatResponse(message) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
    return "Hello! I'm your ML Code Review Assistant. I can help you analyze your machine learning code, suggest improvements, and answer questions about best practices. What would you like to know?";
  }
  
  if (lowerMessage.includes('overfitting') || lowerMessage.includes('overfit')) {
    return "Overfitting occurs when your model learns the training data too well, including noise and irrelevant patterns. To prevent overfitting, consider:\n\n• Using cross-validation\n• Adding regularization (L1/L2)\n• Collecting more training data\n• Using simpler models\n• Early stopping during training";
  }
  
  if (lowerMessage.includes('cross validation') || lowerMessage.includes('cross-validation')) {
    return "Cross-validation is a technique to assess how well your model will generalize to new data. Common approaches include:\n\n• K-fold cross-validation (typically k=5 or k=10)\n• Stratified k-fold (for classification)\n• Leave-one-out cross-validation\n• Time series cross-validation (for temporal data)\n\nThis helps you get a more reliable estimate of model performance.";
  }
  
  if (lowerMessage.includes('feature engineering') || lowerMessage.includes('feature selection')) {
    return "Feature engineering is crucial for ML success:\n\n• **Feature Selection**: Choose relevant features using correlation analysis, mutual information, or recursive feature elimination\n• **Feature Creation**: Create new features from existing ones (polynomial features, interactions)\n• **Feature Scaling**: Normalize/standardize features for algorithms sensitive to scale\n• **Handling Missing Values**: Impute or remove missing data appropriately\n• **Encoding Categorical Variables**: Use one-hot encoding, label encoding, or target encoding";
  }
  
  if (lowerMessage.includes('hyperparameter') || lowerMessage.includes('tuning')) {
    return "Hyperparameter tuning is essential for optimal model performance:\n\n• **Grid Search**: Systematic search through parameter combinations\n• **Random Search**: More efficient than grid search for high-dimensional spaces\n• **Bayesian Optimization**: Uses probabilistic models to guide search\n• **Cross-validation**: Always use CV to evaluate hyperparameters\n• **Common parameters**: learning rate, regularization strength, number of trees, etc.";
  }
  
  if (lowerMessage.includes('evaluation') || lowerMessage.includes('metrics')) {
    return "Choose evaluation metrics based on your problem:\n\n**Classification**:\n• Accuracy, Precision, Recall, F1-score\n• ROC-AUC, PR-AUC\n• Confusion matrix\n\n**Regression**:\n• MSE, RMSE, MAE\n• R² score\n• Explained variance\n\n**Clustering**:\n• Silhouette score\n• Calinski-Harabasz index\n• Davies-Bouldin index";
  }
  
  if (lowerMessage.includes('data preprocessing') || lowerMessage.includes('cleaning')) {
    return "Data preprocessing is the foundation of good ML:\n\n• **Data Cleaning**: Handle missing values, outliers, duplicates\n• **Feature Scaling**: StandardScaler, MinMaxScaler, RobustScaler\n• **Encoding**: One-hot encoding for categorical variables\n• **Feature Selection**: Remove irrelevant or redundant features\n• **Data Validation**: Check for data quality issues\n• **Train/Test Split**: Separate data before any preprocessing";
  }
  
  // Default response
  return "I'm here to help with your machine learning code! I can assist with:\n\n• Code review and best practices\n• Model evaluation and metrics\n• Feature engineering and selection\n• Hyperparameter tuning\n• Data preprocessing\n• Overfitting prevention\n• And much more!\n\nFeel free to ask specific questions about your ML workflow.";
}

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Mock backend server running at http://localhost:${PORT}`);
  console.log('Ready to receive analysis and chat requests...');
  console.log('Endpoints:');
  console.log('  POST /analyze - Code analysis');
  console.log('  POST /chat - Chat assistant');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use. Please stop any existing server on this port.`);
  } else {
    console.error('Server error:', error);
  }
}); 