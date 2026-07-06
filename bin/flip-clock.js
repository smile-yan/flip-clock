#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const binaryName = process.platform === 'win32' ? 'flip-clock.exe' : 'flip-clock';

// 1. Priority: use the binary copied to ~/.flip-clock/bin by postinstall.
const installedPath = path.join(os.homedir(), '.flip-clock', 'bin', binaryName);
if (fs.existsSync(installedPath)) {
  const result = spawnSync(installedPath, process.argv.slice(2), {
    stdio: 'inherit',
    shell: false
  });
  process.exit(result.status ?? 0);
}

// 2. Fallback: use the binary from the platform-specific optional dependency.
const platform = process.platform;
const arch = process.arch;
let platformKey = `${platform}-${arch}`;

// Use 64-bit binary on 32-bit Windows as a best-effort fallback.
if (platform === 'win32' && arch === 'ia32') {
  platformKey = 'win32-x64';
}

const packageMap = {
  'darwin-x64': 'flip-clock-darwin-x64',
  'darwin-arm64': 'flip-clock-darwin-arm64',
  'linux-x64': 'flip-clock-linux-x64',
  'win32-x64': 'flip-clock-win32-x64'
};

const packageName = packageMap[platformKey];
if (!packageName) {
  console.error(`Error: Unsupported platform ${platformKey}`);
  console.error('Supported platforms: darwin (x64/arm64), linux (x64), win32 (x64)');
  console.error('Please visit https://github.com/smile-yan/flip-clock for manual installation');
  process.exit(1);
}

const findBinaryPath = () => {
  const candidates = [
    // npm / yarn classic: nested under the main package's node_modules.
    path.join(__dirname, '..', 'node_modules', packageName, binaryName),
    // pnpm / yarn berry / flat layouts: resolve the package location.
    (() => {
      try {
        const packageJsonPath = require.resolve(packageName + '/package.json');
        return path.join(path.dirname(packageJsonPath), binaryName);
      } catch {
        return null;
      }
    })()
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
};

const binaryPath = findBinaryPath();
if (!binaryPath) {
  console.error(`Error: Binary not found for ${platformKey}`);
  console.error('Expected package:', packageName);
  console.error('Try reinstalling: npm install -g flip-clock');
  process.exit(1);
}

const result = spawnSync(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
  shell: false
});
process.exit(result.status ?? 0);
