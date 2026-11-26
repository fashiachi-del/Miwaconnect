/**
 * No-terminal production build for cPanel shared hosting.
 *
 * Node.js App panel -> "Run JS script" -> build.js
 *
 * cPanel can install dependencies but has no button for `next build`, so this
 * file wraps it. It first repairs a missing or partial node_modules (including
 * the build-only Tailwind/TypeScript packages a production install skips),
 * then runs the production build.
 */
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const root = __dirname;
const nextPackage = join(root, 'node_modules', 'next', 'package.json');
const tailwindPackage = join(root, 'node_modules', 'tailwindcss', 'package.json');

function run(command, args, env) {
  return spawnSync(command, args, {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: process.platform !== 'win32',
  });
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!existsSync(nextPackage) || !existsSync(tailwindPackage)) {
  console.log('Dependencies are missing; installing them (this can take a few minutes)...');
  const install = run(
    'npm',
    ['install', '--include=dev', '--no-audit', '--no-fund'],
    { ...process.env, NODE_ENV: 'development' },
  );

  if (install.error) {
    fail(
      `Could not start npm (${install.error.message}). Click "Run NPM Install", then run build.js again.`,
    );
  }
  if (install.status !== 0) {
    fail('npm install failed. Fix the error above, then run build.js again.');
  }
}

if (!existsSync(nextPackage)) {
  fail('Next.js is still missing after install. Check that package.json lists next in dependencies.');
}

console.log('Building MiwaConnect...');
const build = run(process.execPath, [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build'], {
  ...process.env,
  NODE_ENV: 'production',
});

if (build.error) {
  fail(`Could not start the build: ${build.error.message}`);
}
if (build.status !== 0) {
  process.exit(build.status === null ? 1 : build.status);
}

console.log('Build complete. Restart the application from the Node.js App panel.');
