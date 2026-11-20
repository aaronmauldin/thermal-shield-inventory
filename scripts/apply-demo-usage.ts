import { readFileSync, writeFileSync } from "fs";
import { applyDemoUsageJobs } from "../src/lib/demoUsage";
import type { AppData } from "../src/lib/types";

const file = process.argv[2];
if (!file) {
  console.error("Usage: tsx scripts/apply-demo-usage.ts <inventory.json>");
  process.exit(1);
}

const raw = readFileSync(file, "utf8").replace(/^\uFEFF/, "").trim();
const data = JSON.parse(raw) as AppData;
const result = applyDemoUsageJobs(data);
writeFileSync(file, JSON.stringify(data, null, 2));
console.log(JSON.stringify(result));
