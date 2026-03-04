const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Generate JavaScript file with environment variables
const jsContent = `// Auto-generated environment variables
window.ENV = {
  BACKEND_URL: '${process.env.BACKEND_URL || 'http://localhost:5000'}'
};`;

const outputPath = path.join(__dirname, '..', 'public', 'env.js');
fs.writeFileSync(outputPath, jsContent);

console.log('Generated env.js with environment variables');
