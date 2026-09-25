// Usage: npm run encode -- market.json
import { readFileSync } from "node:fs";
import { encode } from "./encode.ts";

console.log(encode(JSON.parse(readFileSync(process.argv[2]!, "utf8"))));
