// Simple health check script
import fetch from 'node-fetch';

const API_URL = 'https://teacher.windexs.ru/api';

async function checkHealth() {
  console.log('🔍 Checking server health...');
  
  try {
    // Try direct connection
    console.log('📡 Testing direct connection...');
    const directResponse = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email: 'healthcheck@test.com', 
        password: 'test123', 
        name: 'Health Check' 
      })
    });
    
    console.log(`✅ Direct connection: ${directResponse.status}`);
    console.log(`   Response: ${await directResponse.text().catch(() => 'No response')}`);
    
  } catch (error) {
    console.log(`❌ Direct connection failed: ${error.message}`);
  }
}

checkHealth();
