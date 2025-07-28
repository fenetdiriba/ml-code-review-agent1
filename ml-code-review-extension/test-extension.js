const fs = require('fs');
const path = require('path');

// Test the NotebookReader functionality
class NotebookReader {
  static readNotebook(filePath) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content);
    } catch (error) {
      console.error('Error reading notebook:', error);
      return null;
    }
  }

  static extractCodeCells(notebook) {
    return notebook.cells
      .filter(cell => cell.cell_type === 'code')
      .map(cell => cell.source.join(''));
  }

  static extractMarkdownCells(notebook) {
    return notebook.cells
      .filter(cell => cell.cell_type === 'markdown')
      .map(cell => cell.source.join(''));
  }
}

// Test the BackendAPI functionality
class BackendAPI {
  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl;
  }

  async analyzeCode(code, imageData) {
    const https = require('https');
    const http = require('http');
    const url = require('url');
    
    const parsedUrl = url.parse(`${this.baseUrl}/analyze`);
    const client = parsedUrl.protocol === 'https:' ? https : http;
    
    const postData = JSON.stringify({
      code,
      image: imageData
    });

    return new Promise((resolve, reject) => {
      const req = client.request({
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
}

// Test function
async function testExtension() {
  console.log('🧪 Testing ML Code Review Extension...\n');

  // Test 1: Read the sample notebook
  console.log('1. Testing notebook reading...');
  const notebookPath = path.join(__dirname, 'sample-notebook.ipynb');
  const notebook = NotebookReader.readNotebook(notebookPath);
  
  if (!notebook) {
    console.error('❌ Failed to read notebook');
    return;
  }
  
  console.log('✅ Successfully read notebook');
  console.log(`   - Format: ${notebook.nbformat}.${notebook.nbformat_minor}`);
  console.log(`   - Total cells: ${notebook.cells.length}`);

  // Test 2: Extract code cells
  console.log('\n2. Testing code cell extraction...');
  const codeCells = NotebookReader.extractCodeCells(notebook);
  const markdownCells = NotebookReader.extractMarkdownCells(notebook);
  
  console.log(`✅ Found ${codeCells.length} code cells and ${markdownCells.length} markdown cells`);
  
  codeCells.forEach((code, index) => {
    console.log(`   Code cell ${index + 1}: ${code.length} characters`);
  });

  // Test 3: Test backend API
  console.log('\n3. Testing backend API...');
  const api = new BackendAPI();
  const combinedCode = codeCells.join('\n\n');
  
  try {
    const analysis = await api.analyzeCode(combinedCode);
    console.log('✅ Backend API test successful');
    console.log('   Analysis summary:', analysis.summary);
    console.log('   Code quality score:', analysis.codeQuality.score);
    console.log('   ML best practices score:', analysis.mlBestPractices.score);
    console.log('   Performance score:', analysis.performance.score);
  } catch (error) {
    console.error('❌ Backend API test failed:', error.message);
  }

  // Test 4: Test image handling (simulate)
  console.log('\n4. Testing image handling...');
  const mockImageData = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  
  try {
    const analysisWithImage = await api.analyzeCode(combinedCode, mockImageData);
    console.log('✅ Image analysis test successful');
    console.log('   Analysis with image completed');
  } catch (error) {
    console.error('❌ Image analysis test failed:', error.message);
  }

  console.log('\n🎉 Extension testing completed!');
  console.log('\nTo test in VS Code:');
  console.log('1. Open VS Code');
  console.log('2. Press F5 in this project to launch extension development host');
  console.log('3. Open the sample-notebook.ipynb file');
  console.log('4. Right-click and select "Analyze Notebook"');
}

// Run the test
testExtension().catch(console.error); 