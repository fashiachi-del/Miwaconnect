// Applies db/schema.sql to the Neon database in DATABASE_URL.
// Run with: npm run db:setup
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local is optional if DATABASE_URL is already exported.
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "DATABASE_URL is not set. Add your Neon connection string to .env.local first.",
  );
  process.exit(1);
}

const schemaPath = new URL("../db/schema.sql", import.meta.url);
const schema = readFileSync(schemaPath, "utf8");

// The schema contains only simple statements (no function bodies), so a
// semicolon split is safe. Comment-only fragments are skipped.
const statements = schema
  .split(";")
  .map((chunk) => chunk.trim())
  .filter((chunk) =>
    chunk
      .split("\n")
      .some((line) => line.trim() && !line.trim().startsWith("--")),
  );

const sql = neon(connectionString);

for (const statement of statements) {
  await sql.query(statement);
}

console.log(`Applied ${statements.length} statements to the database.`);

const [{ factory_count }] = await sql`SELECT COUNT(*)::int AS factory_count FROM factories`;
console.log(`factories table now holds ${factory_count} rows.`);
