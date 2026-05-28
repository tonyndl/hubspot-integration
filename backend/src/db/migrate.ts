import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
  );

  const sql = readFileSync(join(__dirname, "schema.sql"), "utf-8");

  const { error } = await supabase.rpc("exec_sql", { sql });
  if (error) {
    // Fallback: log the SQL so it can be run manually in Supabase SQL editor
    console.error(
      "Auto-migration failed. Run schema.sql manually in Supabase SQL editor.",
    );
    console.error(error.message);
    process.exit(1);
  }

  console.log("✅ Migration complete");
}

migrate().catch(console.error);
