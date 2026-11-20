import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Keep this minimal — no R2 cache required for a simple inventory app.
export default defineCloudflareConfig({});
