// Usage: npm run lookup -- <marketId> (prints every registry market with that marketId)
import { readFileSync } from "node:fs";

const registry: { marketId: string }[] = JSON.parse(readFileSync("registry.json", "utf8"));
const matches = registry.filter((market) => market.marketId === process.argv[2]?.toLowerCase());
if (!matches.length) throw new Error("marketId not found");
console.log(JSON.stringify(matches, null, 2));
