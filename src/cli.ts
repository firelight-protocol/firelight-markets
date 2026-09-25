// Usage: npm run encode -- market.json (one market, or a list of them)
import { readFileSync } from "node:fs";
import { encode } from "./encode.ts";

for (const market of [JSON.parse(readFileSync(process.argv[2]!, "utf8"))].flat()) console.log(encode(market));
