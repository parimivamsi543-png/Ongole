const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const indexHtml = path.join(rootDir, 'server', 'public', 'index.html');

if (!fs.existsSync(indexHtml)) {
  console.log('[LedgerLine] Built frontend not found at server/public/index.html. Building React client...');
  execSync('npm run build --workspace=client', {
    cwd: rootDir,
    stdio: 'inherit',
  });
} else {
  console.log('[LedgerLine] Frontend build verified at server/public/index.html.');
}

