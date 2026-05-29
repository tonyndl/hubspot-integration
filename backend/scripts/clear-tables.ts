#!/usr/bin/env tsx
/**
 * Interactive Supabase table-clearing script.
 * Usage:
 *   npx tsx scripts/clear-tables.ts              # interactive menu
 *   npx tsx scripts/clear-tables.ts --all        # clear every table (dangerous)
 *   npx tsx scripts/clear-tables.ts --tables sync_events,form_submissions
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from backend/.env
 */

import { createClient } from "@supabase/supabase-js";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as readline from "readline";
import * as dotenv from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../.env") });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Table definitions (order matters — child tables before parents) ───────────
const TABLES = [
  { name: "sync_events",      description: "Sync event log" },
  { name: "form_submissions", description: "Wix form submissions forwarded to HubSpot" },
  { name: "bulk_sync_jobs",   description: "Bulk sync job records" },
  { name: "idempotency_keys", description: "Dedup keys (auto-expire, safe to clear)" },
  { name: "contact_mappings", description: "Wix ↔ HubSpot contact ID pairs" },
  { name: "field_mappings",   description: "Field mapping configuration" },
  { name: "oauth_tokens",     description: "HubSpot OAuth tokens (disconnects the app!)" },
] as const;

type TableName = (typeof TABLES)[number]["name"];

// ── Helpers ───────────────────────────────────────────────────────────────────
async function countRows(table: TableName): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) return -1;
  return count ?? 0;
}

async function clearTable(table: TableName): Promise<{ deleted: number; error?: string }> {
  // DELETE with a condition that matches every row (Supabase blocks unconditional deletes)
  const { error, count } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .neq("id", "00000000-0000-0000-0000-000000000000"); // always-true filter

  if (error) {
    // idempotency_keys uses `key` (text PK), not `id`
    if (table === "idempotency_keys") {
      const r2 = await supabase
        .from(table)
        .delete({ count: "exact" })
        .neq("key", "__never__");
      if (r2.error) return { deleted: 0, error: r2.error.message };
      return { deleted: r2.count ?? 0 };
    }
    return { deleted: 0, error: error.message };
  }
  return { deleted: count ?? 0 };
}

function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const clearAll = args.includes("--all");
  const tablesArg = args.find((a) => a.startsWith("--tables="))?.split("=")[1];
  const requestedTables = tablesArg?.split(",").map((t) => t.trim()) as TableName[] | undefined;

  console.log("\n🗑  Supabase Table Cleaner");
  console.log(`   Project: ${SUPABASE_URL}\n`);

  // Resolve which tables to act on
  let targets: typeof TABLES[number][] = [];

  if (clearAll) {
    targets = [...TABLES];
  } else if (requestedTables) {
    targets = TABLES.filter((t) => requestedTables.includes(t.name));
    const unknown = requestedTables.filter((r) => !TABLES.find((t) => t.name === r));
    if (unknown.length) {
      console.error(`Unknown tables: ${unknown.join(", ")}`);
      process.exit(1);
    }
  } else {
    // Interactive menu
    console.log("Select tables to clear (fetching row counts…)\n");
    const counts = await Promise.all(TABLES.map((t) => countRows(t.name)));

    TABLES.forEach((t, i) => {
      const count = counts[i];
      const countStr = count === -1 ? "?" : String(count);
      const padded = countStr.padStart(5);
      console.log(`  [${i + 1}] ${t.name.padEnd(20)} ${padded} rows  — ${t.description}`);
    });

    console.log("\n  Enter numbers separated by commas (e.g. 1,3,4), or 'all', or 'q' to quit:");

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await prompt(rl, "  > ")).trim().toLowerCase();
    rl.close();

    if (answer === "q" || answer === "") {
      console.log("Aborted.");
      process.exit(0);
    }

    if (answer === "all") {
      targets = [...TABLES];
    } else {
      const indices = answer
        .split(",")
        .map((s) => parseInt(s.trim(), 10) - 1)
        .filter((i) => !isNaN(i) && i >= 0 && i < TABLES.length);

      if (indices.length === 0) {
        console.log("No valid selection. Aborted.");
        process.exit(0);
      }
      targets = indices.map((i) => TABLES[i]);
    }
  }

  if (targets.length === 0) {
    console.log("Nothing selected.");
    process.exit(0);
  }

  // Warn if oauth_tokens is selected
  if (targets.some((t) => t.name === "oauth_tokens")) {
    console.log("\n⚠️  WARNING: oauth_tokens is selected. This will disconnect all HubSpot accounts!");
  }

  // Confirmation
  console.log(`\nAbout to clear ${targets.length} table(s):`);
  targets.forEach((t) => console.log(`  • ${t.name}`));

  const rl2 = readline.createInterface({ input: process.stdin, output: process.stdout });
  const confirm = (await prompt(rl2, "\nType YES to confirm: ")).trim();
  rl2.close();

  if (confirm !== "YES") {
    console.log("Aborted.");
    process.exit(0);
  }

  // Execute
  console.log("");
  for (const t of targets) {
    process.stdout.write(`  Clearing ${t.name}… `);
    const result = await clearTable(t.name);
    if (result.error) {
      console.log(`FAILED — ${result.error}`);
    } else {
      console.log(`done (${result.deleted} rows deleted)`);
    }
  }

  console.log("\nDone.\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
