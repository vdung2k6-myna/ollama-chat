const fs = require('fs');
const path = require('path');

// Read .env file
const envPath = path.join(__dirname, '..', '.env');
const envContent = fs.readFileSync(envPath, 'utf8');

// Parse environment variables
const envVars = {};
envContent.split('\n').forEach(line => {
  const [key, value] = line.split('=');
  if (key && value) {
    envVars[key.trim()] = value.trim();
  }
});

// Generate JavaScript file with environment variables
const jsContent = `// Auto-generated environment variables
window.ENV = {
  BACKEND_URL: '${envVars.BACKEND_URL || 'http://localhost:5000'}'
};`;

const outputPath = path.join(__dirname, '..', 'public', 'env.js');
fs.writeFileSync(outputPath, jsContent);

console.log('Generated env.js with environment variables');