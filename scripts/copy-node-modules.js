#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

/**
 * Copy specific node_modules dependencies to public folder at build time
 * This replaces the need for serving node_modules statically
 */

const PUBLIC_DIR = path.join(__dirname, '../public');
const NODE_MODULES_DIR = path.join(__dirname, '../node_modules');

// Dependencies that need to be copied from node_modules
const DEPENDENCIES_TO_COPY = [
    {
        source: '@supabase/supabase-js/dist/umd/supabase.js',
        target: 'node_modules/@supabase/supabase-js/dist/umd/supabase.js'
    },
    {
        source: 'marked/lib/marked.umd.js',
        target: 'node_modules/marked/lib/marked.umd.js'
    }
];

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

function copyFile(source, target) {
    const sourcePath = path.join(NODE_MODULES_DIR, source);
    const targetPath = path.join(PUBLIC_DIR, target);
    
    // Ensure target directory exists
    ensureDir(path.dirname(targetPath));
    
    try {
        fs.copyFileSync(sourcePath, targetPath);
        console.log(`✓ Copied ${source} -> ${target}`);
        return true;
    } catch (error) {
        console.error(`✗ Failed to copy ${source}:`, error.message);
        return false;
    }
}

function main() {
    console.log('📦 Copying node_modules dependencies to public folder...');
    
    // Check if node_modules exists
    if (!fs.existsSync(NODE_MODULES_DIR)) {
        console.error('❌ node_modules directory not found. Please run npm install first.');
        process.exit(1);
    }
    
    // Check if public directory exists
    if (!fs.existsSync(PUBLIC_DIR)) {
        console.error('❌ public directory not found.');
        process.exit(1);
    }
    
    let successCount = 0;
    let totalCount = DEPENDENCIES_TO_COPY.length;
    
    for (const dep of DEPENDENCIES_TO_COPY) {
        if (copyFile(dep.source, dep.target)) {
            successCount++;
        }
    }
    
    console.log(`\n📊 Copying complete: ${successCount}/${totalCount} files copied`);
    
    if (successCount === totalCount) {
        console.log('✅ All dependencies copied successfully!');
        process.exit(0);
    } else {
        console.log('❌ Some dependencies failed to copy. Please check the errors above.');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = { copyDependencies: main };