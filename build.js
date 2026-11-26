/**
 * No-terminal production build for cPanel shared hosting.
 *
 * Node.js App panel -> "Run JS script" -> build.js
 *
 * cPanel's panel can install dependencies but has no button for `next build`,
 * so this file wraps it. It also installs the build-only dependencies that a
 * production `npm install` skips (Tailwind and TypeScript).
 */
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const root = __dirname;
const nextBin = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform !== 'win32',
  });

  if (result.error) {
    console.error(`Could not run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status === null ? 1 : result.status);
  }
}

if (!existsSync(join(root, 'node_modules', 'tailwindcss'))) {
  console.log('Build dependencies are missing; installing them...');
  run('npm', ['install', '--include=dev', '--no-audit', '--no-fund'], {
    ...process.env,
    NODE_ENV: 'development',
  });
}

if (!existsSync(nextBin)) {
  console.error('Next.js is not installed. Click "Run NPM Install" first.');
  process.exit(1);
}

console.log('Building MiwaConnect...');
run(process.execPath, [nextBin, 'build'], {
  ...process.env,
  NODE_ENV: 'production',
});

console.log('Build complete. Restart the application from the Node.js App panel.');
