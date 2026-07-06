const fs = require('fs');
const path = require('path');
const os = require('os');

const silent =
  process.env.npm_config_loglevel === 'silent' ||
  process.env.FLIP_CLOCK_SKIP_PREUNINSTALL === '1';

try {
  const binDir = path.join(os.homedir(), '.flip-clock', 'bin');

  if (fs.existsSync(binDir)) {
    fs.rmSync(binDir, { recursive: true, force: true });
  }

  if (!silent) {
    console.log('🧹 Removed the flip-clock binary installed by npm.');
    console.log('Your configuration at ~/.flip-clock/config.json is preserved.');
  }
} catch (error) {
  if (!silent) {
    console.log('Note: Could not fully clean up the flip-clock binary.');
    console.log('You can manually remove:', path.join(os.homedir(), '.flip-clock', 'bin'));
    if (process.env.DEBUG) {
      console.error(error);
    }
  }
}
