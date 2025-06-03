const { readFileSync, writeFileSync } = require('fs');
const configPath = 'src/config/env.json';

const envContent = JSON.parse(readFileSync(configPath, { encoding: 'utf-8' }));
envContent.mode = process.env.MODE ? process.env.MODE : 'dev';
writeFileSync(configPath, JSON.stringify(envContent, null, 4), { encoding: 'utf-8' });
