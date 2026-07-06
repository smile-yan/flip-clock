const fs = require('fs');
const path = require('path');
const os = require('os');

const silent =
  process.env.npm_config_loglevel === 'silent' ||
  process.env.FLIP_CLOCK_SKIP_POSTINSTALL === '1';

if (!silent) {
  console.log('🕐 Setting up flip-clock...');
}

try {
  const platform = process.platform;
  const arch = process.arch;
  const binaryName = platform === 'win32' ? 'flip-clock.exe' : 'flip-clock';
  const binDir = path.join(os.homedir(), '.flip-clock', 'bin');
  const targetPath = path.join(binDir, binaryName);

  let platformKey = `${platform}-${arch}`;
  if (platform === 'win32' && arch === 'ia32') {
    platformKey = 'win32-x64';
  }

  const packageMap = {
    'darwin-x64': 'flip-clock-app-darwin-x64',
    'darwin-arm64': 'flip-clock-app-darwin-arm64',
    'linux-x64': 'flip-clock-app-linux-x64',
    'win32-x64': 'flip-clock-app-win32-x64'
  };

  const packageName = packageMap[platformKey];
  if (!packageName) {
    if (!silent) {
      console.log(`Platform ${platformKey} is not supported for auto-setup.`);
      console.log('You can still run flip-clock if the binary is available in PATH.');
    }
    process.exit(0);
  }

  const findBinaryPath = () => {
    const candidates = [
      // npm / yarn classic: nested in the main package's node_modules.
      path.join(__dirname, '..', 'node_modules', packageName, binaryName),
      // pnpm / flat layouts: resolve via require.
      (() => {
        try {
          const packageJsonPath = require.resolve(packageName + '/package.json');
          return path.join(path.dirname(packageJsonPath), binaryName);
        } catch {
          return null;
        }
      })(),
      // pnpm: search the .pnpm store for any matching version.
      (() => {
        const currentPath = __dirname;
        const pnpmMatch = currentPath.match(/(.+\.pnpm)[\\/]([^\\/]+)[\\/]/);
        if (!pnpmMatch) {
          return null;
        }
        const pnpmRoot = pnpmMatch[1];
        const encodedName = packageName.replace('/', '+');
        try {
          const entries = fs.readdirSync(pnpmRoot);
          const pattern = new RegExp(
            '^' + encodedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '@'
          );
          const matched = entries.find(entry => pattern.test(entry));
          if (matched) {
            return path.join(
              pnpmRoot,
              matched,
              'node_modules',
              packageName,
              binaryName
            );
          }
        } catch {
          // ignore
        }
        return null;
      })()
    ].filter(Boolean);

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  };

  const sourcePath = findBinaryPath();
  if (!sourcePath) {
    if (!silent) {
      console.log('Binary package not installed. The flip-clock command will try');
      console.log('to use the bundled binary at runtime, or you can install it manually.');
    }
    process.exit(0);
  }

  fs.mkdirSync(binDir, { recursive: true });

  if (platform === 'win32') {
    fs.copyFileSync(sourcePath, targetPath);
  } else {
    try {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      fs.linkSync(sourcePath, targetPath);
    } catch {
      fs.copyFileSync(sourcePath, targetPath);
    }
    fs.chmodSync(targetPath, '755');
  }

  if (!silent) {
    console.log('✨ flip-clock is ready!');
    console.log(`📍 Binary: ${targetPath}`);
    console.log('🚀 Run: flip-clock');
  }
} catch (error) {
  if (!silent) {
    console.log('Note: Could not auto-configure flip-clock.');
    console.log('The command will still work if the binary is available.');
    if (process.env.DEBUG) {
      console.error(error);
    }
  }
}
