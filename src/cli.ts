// Usage: npm run encode -- markets.json [--write]
// Prints one marketId per market, or with --write, writes registry.json.
import { readFileSync, writeFileSync } from "node:fs";
import { encode, registry } from "./encode.ts";

const [file, flag] = process.argv.slice(2);
if (!file) throw new Error("usage: npm run encode -- <markets.json> [--write]");
const markets = [JSON.parse(readFileSync(file, "utf8"))].flat();
if (flag === "--write") writeFileSync("registry.json", `${JSON.stringify(registry(markets), null, 2)}\n`);
else for (const market of markets) console.log(encode(market));
