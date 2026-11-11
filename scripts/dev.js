const { spawn } = require('child_process');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

const serverProc = spawn(npmCmd, ['run', 'dev', '--prefix', 'server'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: isWin,
});

const clientProc = spawn(npmCmd, ['run', 'dev', '--prefix', 'client'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: isWin,
});

const shutdown = () => {
  serverProc.kill();
  clientProc.kill();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

