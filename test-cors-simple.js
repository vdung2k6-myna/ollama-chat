const fetch = require('node-fetch');

async function testCORSSimple() {
    try {
        console.log('Testing CORS configuration for GitHub OAuth endpoint (simple)...');
        
        // Test the GitHub auth endpoint with a simple request
        const response = await fetch('http://localhost:8000/auth/github', {
            method: 'GET'
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:');
        response.headers.forEach((value, name) => {
            if (name.toLowerCase().includes('access-control') || name.toLowerCase().includes('origin')) {
                console.log(`  ${name}: ${value}`);
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('Response data:', JSON.stringify(data, null, 2));
            console.log('✅ CORS test passed! GitHub OAuth endpoint is accessible.');
        } else {
            console.log('❌ CORS test failed! Response not OK:', response.statusText);
            const errorText = await response.text();
            console.log('Error response:', errorText);
        }
        
    } catch (error) {
        console.error('❌ Error testing CORS:', error.message);
    }
}

testCORSSimple();