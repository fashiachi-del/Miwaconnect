// cPanel/Passenger startup wrapper for the prebuilt standalone bundle.
// The generated Next server is renamed to next-server.js at packaging time,
// so any startup failure lands in boot.log instead of a blank 503.
const fs = require("fs");
const path = require("path");

const logFile = path.join(__dirname, "boot.log");
const write = (message) => {
  try {
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${message}\n`);
  } catch {
    // Logging must never be the reason the app fails.
  }
};

write(`boot node=${process.version} cwd=${process.cwd()}`);
write(`env PORT=${process.env.PORT || ""} NODE_ENV=${process.env.NODE_ENV || ""}`);

process.on("uncaughtException", (error) => {
  write(`uncaught: ${(error && error.stack) || error}`);
  process.exit(1);
});

process.on("unhandledRejection", (error) => {
  write(`unhandled: ${(error && error.stack) || error}`);
  process.exit(1);
});

try {
  require("./next-server.js");
  write("server.js loaded");
} catch (error) {
  write(`require failed: ${(error && error.stack) || error}`);
  throw error;
}
