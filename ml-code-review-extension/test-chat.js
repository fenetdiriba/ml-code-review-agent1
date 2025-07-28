const http = require('http');
const url = require('url');

// Test the chat functionality directly
async function testChat() {
  console.log('🧪 Testing ML Code Review Chat...\n');

  const testMessages = [
    "Hello, how can you help me with ML code?",
    "How can I prevent overfitting?",
    "What are good feature engineering practices?",
    "Explain cross-validation techniques"
  ];

  for (let i = 0; i < testMessages.length; i++) {
    const message = testMessages[i];
    console.log(`\n${i + 1}. Testing: "${message}"`);
    
    try {
      const response = await sendChatMessage(message);
      console.log('✅ Response received:');
      console.log(`   ${response.response.substring(0, 100)}...`);
    } catch (error) {
      console.error('❌ Error:', error.message);
    }
  }

  console.log('\n🎉 Chat testing completed!');
  console.log('\nTo use in Cursor/VS Code:');
  console.log('1. Press F5 to launch extension development host');
  console.log('2. Cmd+Shift+P → "ML Code Review: Open Chat Assistant"');
  console.log('3. Start chatting with the assistant!');
}

function sendChatMessage(message) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ message });
    
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/chat',
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

// Run the test
testChat().catch(console.error); 