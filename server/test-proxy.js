const { HttpsProxyAgent } = require('https-proxy-agent');
const OpenAI = require('openai');

// Test proxy configuration
const PROXY_CONFIG = {
  host: '185.68.186.158',
  port: '8000',
  auth: '7BwWCS:BBBvb6'
};

async function testProxy() {
  console.log('🔍 Testing proxy connection...');
  console.log('🌐 Proxy:', `${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);
  console.log('👤 Auth:', PROXY_CONFIG.auth.replace(/:.*$/, ':****'));

  try {
    // Create proxy agent
    const proxyUrl = `http://${PROXY_CONFIG.auth}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;
    const proxyAgent = new HttpsProxyAgent(proxyUrl);

    // Initialize OpenAI with proxy
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      httpAgent: proxyAgent,
      timeout: 30000
    });

    console.log('🤖 Testing OpenAI API call...');

    // Test with a simple request
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'Hello, test message' }],
      max_tokens: 10
    });

    console.log('✅ Proxy test successful!');
    console.log('📝 Response:', completion.choices[0]?.message?.content);

  } catch (error) {
    console.error('❌ Proxy test failed:', error.message);
    console.error('🔍 Error details:', {
      code: error.code,
      type: error.type,
      status: error.status
    });

    // Try without proxy
    console.log('🔄 Testing without proxy...');
    try {
      const openaiDirect = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 30000
      });

      const completion = await openaiDirect.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'Hello, direct test' }],
        max_tokens: 10
      });

      console.log('✅ Direct connection works!');
      console.log('📝 Response:', completion.choices[0]?.message?.content);

    } catch (directError) {
      console.error('❌ Direct connection also failed:', directError.message);
    }
  }
}

testProxy();
