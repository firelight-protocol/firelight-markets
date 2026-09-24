// End-to-end CLI tests. The CLI runs under whichever runtime runs the tests (process.execPath).

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const CLI = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

function run(...args: string[]) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [CLI, ...args], { encoding: "utf8" });
  return { status, stdout, stderr };
}

const PRIME_MAIN_ID = "0x000000000000000000000000c21b08c16458202593d4d9b26b9984ee67b38bbd";

describe("lookup", () => {
  it("prints the market and its protocol", () => {
    const { status, stdout } = run("lookup", "--chain", "1", PRIME_MAIN_ID);
    assert.equal(status, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.marketId, PRIME_MAIN_ID);
    assert.equal(result.market.name, "Sentora PRIME Main");
    assert.equal(result.protocol.id, "morpho_vault");
    assert.equal(result.protocol.name, "Morpho Vault");
  });

  it("exits 1 when the market is not on that chain", () => {
    const { status, stderr } = run("lookup", "--chain", "5000", PRIME_MAIN_ID);
    assert.equal(status, 1);
    assert.match(stderr, /not found/);
  });

  it("exits 2 without --chain or with a malformed marketId", () => {
    assert.equal(run("lookup", PRIME_MAIN_ID).status, 2);
    assert.equal(run("lookup", "--chain", "1", "0xc21b08c16458202593d4d9b26b9984ee67b38bbd").status, 2);
  });
});

describe("encode", () => {
  it("prints the marketId and that it is registered", () => {
    const { status, stdout } = run("encode", "--chain", "1", "--kind", "evm_address", "0xC21b08C16458202593D4D9B26b9984Ee67b38BbD");
    assert.equal(status, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.marketId, PRIME_MAIN_ID);
    assert.equal(result.registered, true);
    assert.equal(result.market.name, "Sentora PRIME Main");
  });

  it("accepts lowercase addresses and name=value params in any order", () => {
    const { status, stdout } = run(
      "encode", "--chain", "1", "--kind", "aave_v3_position.v1",
      "debtToken=0x6df1c1e379bc5a00a7b4c6e67a203333772f45a8",
      "collateralAToken=0x0b925ed163218f6662a35e0f0371ac234f9e9371",
    );
    assert.equal(status, 0);
    const result = JSON.parse(stdout);
    assert.deepEqual(result.params, {
      debtToken: "0x6df1C1E379bC5a00a7b4C6e67A203333772f45A8",
      collateralAToken: "0x0B925eD163218f6662a35e0f0371Ac234f9E9371",
    });
    assert.equal(result.marketId, "0xd6500ca21d37fbe099c7b800e79ca95edbb864e63d20a2532f62e863d04d816c");
    assert.equal(result.registered, true);
  });

  it("reports unregistered markets", () => {
    const { status, stdout } = run(
      "encode", "--chain", "1", "--kind", "morpho_blue_supply.v1",
      "0x41c41d0c9aadbf4751f5ee215ed5a16954a4b34e1b70fca5393d4b08858fa3fa",
    );
    assert.equal(status, 0);
    const result = JSON.parse(stdout);
    assert.equal(result.marketId, "0xe53daf7fe7ac587cdeb0f679512b04ec2c45f7b7d653f88885260a4766fdd551");
    assert.equal(result.registered, false);
  });

  it("encodes Stellar contracts on the Stellar chain only", () => {
    const vault = "CAHEWHOPPDBQYFMAOLDOXXGUX2BCR7EXP4CWYCRY3NEAJB35YPZMMJFF";
    const ok = run("encode", "--chain", "9223372036854775809", "--kind", "stellar_contract", vault);
    assert.equal(ok.status, 0);
    assert.equal(JSON.parse(ok.stdout).registered, true);
    const wrongChain = run("encode", "--chain", "1", "--kind", "stellar_contract", vault);
    assert.equal(wrongChain.status, 2);
    assert.match(wrongChain.stderr, /is for stellar chains/);
  });

  it("rejects wrong param counts, unknown param names and bad checksums", () => {
    assert.match(run("encode", "--chain", "1", "--kind", "aave_v3_position.v1", "0x0B925eD163218f6662a35e0f0371Ac234f9E9371").stderr, /takes 2 param/);
    assert.match(run("encode", "--chain", "1", "--kind", "evm_address", "addr=0xC21b08C16458202593D4D9B26b9984Ee67b38BbD").stderr, /no param "addr"/);
    const badChecksum = run("encode", "--chain", "1", "--kind", "evm_address", "0xc21B08C16458202593D4D9B26b9984Ee67b38BbD");
    assert.equal(badChecksum.status, 2);
    assert.match(badChecksum.stderr, /not checksummed/);
  });
});

describe("validate", () => {
  it("passes on markets.json", () => {
    const { status, stdout } = run("validate");
    assert.equal(status, 0);
    assert.match(stdout, /^ok: \d+ markets/);
  });
});
