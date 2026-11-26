/**
 * cPanel / Phusion Passenger entry point.
 *
 * cPanel's "Setup Node.js App" runs this file directly and expects it to start
 * an HTTP server on process.env.PORT. `next start` is not used there, so this
 * file must load the production build itself.
 *
 * Requirements on the server:
 *   1. Node.js 20.9+ (Next 16 minimum)
 *   2. npm install
 *   3. npm run build   (creates .next/BUILD_ID)
 *
 * Set the application startup file to `server.js` in cPanel.
 */
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { createServer } = require('node:http');
const next = require('next');

const dir = __dirname;
// Unset NODE_ENV must mean production on a host, never Next dev mode.
const dev = process.env.NODE_ENV === 'development';
const port = Number.parseInt(process.env.PORT || '3000', 10);

if (!Number.isInteger(port) || port <= 0) {
  console.error(`Invalid PORT value: ${process.env.PORT}`);
  process.exit(1);
}

if (!dev && !existsSync(join(dir, '.next', 'BUILD_ID'))) {
  console.error(
    'No production build found (.next/BUILD_ID is missing). Run `npm install` then `npm run build` in the application root before starting.',
  );
  process.exit(1);
}

const app = next({ dev, dir });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = createServer((req, res) => {
      handle(req, res).catch((error) => {
        console.error('Request handler failed:', error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('content-type', 'text/plain; charset=utf-8');
        }
        res.end('Internal Server Error');
      });
    });

    server.on('error', (error) => {
      console.error('HTTP server failed to listen:', error);
      process.exit(1);
    });

    server.listen(port, () => {
      console.log(
        `MiwaConnect ready on port ${port} (${dev ? 'development' : 'production'})`,
      );
    });
  })
  .catch((error) => {
    console.error('Next.js failed to start:', error);
    process.exit(1);
  });
