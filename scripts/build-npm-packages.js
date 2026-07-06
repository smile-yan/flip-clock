#!/usr/bin/env node
/**
 * Build the npm distribution packages for flip-clock.
 *
 * Given a directory of platform binaries, this script creates:
 *   - One platform package per binary (e.g. flip-clock-darwin-arm64)
 *   - The main flip-clock package with optionalDependencies pointing to them
 *
 * Usage:
 *   node scripts/build-npm-packages.js <binaries-dir> [output-dir]
 *
 * The binaries directory must contain files named like:
 *   flip-clock-darwin-arm64
 *   flip-clock-darwin-x64
 *   flip-clock-linux-x64
 *   flip-clock-win32-x64.exe
 *
 * Example CI usage:
 *   node scripts/build-npm-packages.js ./release-binaries ./npm-packages
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT, 'package.json');

function readMainPackageJson() {
  return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
}

function parseBinaryName(filename) {
  // Supported patterns:
  //   flip-clock-darwin-arm64
  //   flip-clock-darwin-x64
  //   flip-clock-linux-x64
  //   flip-clock-win32-x64.exe
  //   flip-clock-windows-x64.exe (mapped to win32 for npm)
  const base = filename.replace(/\.exe$/i, '');
  const match = base.match(/^flip-clock-([^-]+)-(.+)$/);
  if (!match) {
    return null;
  }
  const [, rawOs, cpuName] = match;
  // npm uses "win32" for Windows; other platform identifiers match our names.
  const osName = rawOs === 'windows' ? 'win32' : rawOs;
  return { os: osName, cpu: cpuName, filename };
}

function createPlatformPackage(outputDir, binaryDir, meta, version) {
  const packageName = `flip-clock-app-${meta.os}-${meta.cpu}`;
  const packageDir = path.join(outputDir, packageName);
  fs.mkdirSync(packageDir, { recursive: true });

  // The launcher/postinstall scripts expect a normalized binary name inside
  // the package: "flip-clock" on Unix, "flip-clock.exe" on Windows.
  const destFilename = meta.os === 'win32' ? 'flip-clock.exe' : 'flip-clock';

  const packageJson = {
    name: packageName,
    version,
    description: `${meta.os} ${meta.cpu} binary for flip-clock-app`,
    files: [destFilename],
    os: [meta.os],
    cpu: [meta.cpu],
    author: 'smileyan',
    license: 'MIT',
    repository: {
      type: 'git',
      url: 'git+https://github.com/smile-yan/flip-clock.git'
    }
  };

  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify(packageJson, null, 2) + '\n'
  );

  const sourcePath = path.join(binaryDir, meta.filename);
  const targetPath = path.join(packageDir, destFilename);
  fs.copyFileSync(sourcePath, targetPath);
  fs.chmodSync(targetPath, '755');

  return packageName;
}

function createMainPackage(outputDir, platformDeps, version) {
  const mainPackageDir = path.join(outputDir, 'flip-clock-app');
  fs.mkdirSync(mainPackageDir, { recursive: true });

  const mainPackage = readMainPackageJson();
  mainPackage.version = version;
  mainPackage.optionalDependencies = Object.fromEntries(
    platformDeps.map(name => [name, version])
  );

  fs.writeFileSync(
    path.join(mainPackageDir, 'package.json'),
    JSON.stringify(mainPackage, null, 2) + '\n'
  );

  // Copy launcher scripts and wrappers.
  const binDir = path.join(mainPackageDir, 'bin');
  const scriptsDir = path.join(mainPackageDir, 'scripts');
  fs.mkdirSync(binDir, { recursive: true });
  fs.mkdirSync(scriptsDir, { recursive: true });

  fs.copyFileSync(path.join(ROOT, 'bin', 'flip-clock.js'), path.join(binDir, 'flip-clock.js'));
  fs.copyFileSync(path.join(ROOT, 'scripts', 'postinstall.js'), path.join(scriptsDir, 'postinstall.js'));
  fs.copyFileSync(path.join(ROOT, 'scripts', 'preuninstall.js'), path.join(scriptsDir, 'preuninstall.js'));

  // Copy documentation and license if present.
  for (const filename of ['README.md', 'LICENSE']) {
    const src = path.join(ROOT, filename);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(mainPackageDir, filename));
    }
  }

  return mainPackageDir;
}

function main() {
  const binaryDir = process.argv[2];
  const outputDir = process.argv[3] || path.join(ROOT, 'npm-packages');

  if (!binaryDir) {
    console.error('Usage: node scripts/build-npm-packages.js <binaries-dir> [output-dir]');
    process.exit(1);
  }

  const resolvedBinaryDir = path.resolve(binaryDir);
  const resolvedOutputDir = path.resolve(outputDir);

  if (!fs.existsSync(resolvedBinaryDir)) {
    console.error(`Binary directory not found: ${resolvedBinaryDir}`);
    process.exit(1);
  }

  const mainPackage = readMainPackageJson();
  const version = mainPackage.version;

  const files = fs.readdirSync(resolvedBinaryDir).filter(f => {
    const stat = fs.statSync(path.join(resolvedBinaryDir, f));
    return stat.isFile();
  });

  const metas = files.map(parseBinaryName).filter(Boolean);
  if (metas.length === 0) {
    console.error(`No supported binaries found in ${resolvedBinaryDir}`);
    console.error('Expected files like: flip-clock-darwin-arm64, flip-clock-linux-x64, flip-clock-win32-x64.exe');
    process.exit(1);
  }

  fs.rmSync(resolvedOutputDir, { recursive: true, force: true });
  fs.mkdirSync(resolvedOutputDir, { recursive: true });

  const platformDeps = [];
  for (const meta of metas) {
    const packageName = createPlatformPackage(resolvedOutputDir, resolvedBinaryDir, meta, version);
    platformDeps.push(packageName);
    console.log(`Created platform package: ${packageName}`);
  }

  const mainPackageDir = createMainPackage(resolvedOutputDir, platformDeps, version);
  const mainPackageName = readMainPackageJson().name;
  console.log(`Created main package: ${mainPackageName}@${version}`);
  console.log(`Output directory: ${resolvedOutputDir}`);
}

main();
