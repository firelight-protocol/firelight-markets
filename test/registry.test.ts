import assert from "node:assert/strict";
import { test } from "node:test";
import markets from "../markets.json" with { type: "json" };
import published from "../registry.json" with { type: "json" };
import { registry } from "../src/encode.ts";

test("registry.json is up to date (run npm run encode -- markets.json --write)", () => assert.deepEqual(published, registry(markets)));

test("duplicate markets are rejected", () => assert.throws(() => registry([markets[0], markets[0]])));
