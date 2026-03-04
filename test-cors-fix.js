const fetch = require('node-fetch');

async function testCORSFix() {
    console.log('Testing CORS fix for GitHub auth endpoint...\n');
    
    const backendUrl = 'https://ollama-chat-server.onrender.com';
    const testOrigins = [
        'https://realtime-chat-supabase-react-master.onrender.com',
    ];

    for (const origin of testOrigins) {
        console.log(`Testing origin: ${origin}`);
        
        try {
            const response = await fetch(`${backendUrl}/auth/github`, {
                method: 'GET',
                headers: {
                    'Origin': origin,
                    'Content-Type': 'application/json'
                }
            });

            console.log(`  Status: ${response.status}`);
            console.log(`  Access-Control-Allow-Origin: ${response.headers.get('access-control-allow-origin')}`);
            console.log(`  Success: ${response.ok ? 'YES' : 'NO'}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log(`  Response: ${JSON.stringify(data, null, 2)}`);
            }
            
        } catch (error) {
            console.log(`  Error: ${error.message}`);
        }
        
        console.log('---\n');
    }
}

testCORSFix().catch(console.error);