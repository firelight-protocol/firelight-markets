// Registry validation (SPECS §6.2): markets.json itself, and each check against a broken registry.

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findMarket, readRegistry, validateRegistry, type Registry } from "../src/registry.ts";

describe("markets.json", () => {
  it("passes validation", () => {
    const { errors, entries } = validateRegistry(readRegistry());
    assert.deepEqual(errors, []);
    assert.ok(entries.length > 0);
  });
});

const PRIME_MAIN = "0xC21b08C16458202593D4D9B26b9984Ee67b38BbD";

function registry(overrides: Partial<Registry> & Record<string, unknown> = {}): Registry {
  return {
    schemaVersion: 1,
    chains: { "1": { name: "Ethereum" }, "9223372036854775809": { name: "Stellar" } },
    protocols: { morpho_vault: { name: "Morpho Vault", description: "Morpho vaults" } },
    markets: [
      { chainId: "1", protocol: "morpho_vault", kind: "evm_address", params: { address: PRIME_MAIN }, name: "Sentora PRIME Main" },
    ],
    ...overrides,
  };
}

function market(overrides: Record<string, unknown>) {
  return { ...registry().markets[0]!, ...overrides } as Registry["markets"][number];
}

function errorsOf(raw: unknown): string[] {
  return validateRegistry(raw).errors;
}

function assertError(raw: unknown, message: RegExp) {
  const errors = errorsOf(raw);
  assert.ok(errors.some((error) => message.test(error)), `expected an error matching ${message}, got:\n${errors.join("\n")}`);
}

describe("validation", () => {
  it("accepts a minimal valid registry", () => {
    assert.deepEqual(errorsOf(registry()), []);
  });

  it("uniqueness: rejects two markets with the same (chainId, marketId)", () => {
    const duplicate = market({ name: "Duplicate" });
    assertError(registry({ markets: [registry().markets[0]!, duplicate] }), /markets\[1\] \(Duplicate\): same \(chainId, marketId\) as markets\[0\]/);
  });

  it("uniqueness: allows the same marketId on different chains", () => {
    const chains = { "1": { name: "Ethereum" }, "5000": { name: "Mantle" } };
    assert.deepEqual(errorsOf(registry({ chains, markets: [market({}), market({ chainId: "5000" })] })), []);
  });

  it("references: rejects undeclared protocols and chains", () => {
    assertError(registry({ markets: [market({ protocol: "morpho_market" })] }), /protocol "morpho_market" is not declared/);
    assertError(registry({ markets: [market({ chainId: "5000" })] }), /chainId "5000" is not declared/);
  });

  it("params: rejects params that do not match the kind", () => {
    assertError(registry({ markets: [market({ params: { address: PRIME_MAIN.toLowerCase() } })] }), /not checksummed/);
    assertError(registry({ markets: [market({ params: { vault: PRIME_MAIN } })] }), /takes params \{address\}/);
    assertError(registry({ markets: [market({ params: { address: 1 } })] }), /address: must be a string/);
    assertError(registry({ markets: [market({ kind: "evm_address.v1" })] }), /unknown kind "evm_address.v1"/);
  });

  it("params: rejects a kind used on the wrong chain family", () => {
    assertError(registry({ markets: [market({ chainId: "9223372036854775809" })] }), /evm_address is for evm chains, but chain 9223372036854775809 is stellar/);
  });

  it("rejects stored marketIds, status fields and other unknown fields", () => {
    assertError(registry({ markets: [market({ marketId: "0x00" })] }), /unknown field "marketId"/);
    assertError(registry({ markets: [market({ status: "active" })] }), /unknown field "status"/);
    assertError(registry({ extra: true }), /registry: unknown field "extra"/);
  });

  it("rejects missing required fields and empty strings", () => {
    const { name: _, ...nameless } = market({});
    assertError(registry({ markets: [nameless as Registry["markets"][number]] }), /missing required field "name"/);
    const { params: __, ...paramless } = market({});
    assertError(registry({ markets: [paramless as Registry["markets"][number]] }), /missing required field "params"/);
    assertError(registry({ markets: [market({ description: "" })] }), /description: must be a non-empty string/);
    assertError(registry({ protocols: { morpho_vault: { name: "Morpho Vault" } as Registry["protocols"][string] } }), /missing required field "description"/);
  });

  it("rejects non-https URLs", () => {
    assertError(registry({ markets: [market({ url: "http://example.com" })] }), /url: must be an https URL/);
    assert.deepEqual(errorsOf(registry({ markets: [market({ url: "https://app.morpho.org" })] })), []);
  });

  it("rejects protocol names that are not lowercase snake_case", () => {
    for (const name of ["MorphoVault", "morpho-vault", "morpho__vault", "_morpho", "morpho_"]) {
      const protocols = { [name]: { name: "x", description: "x" } };
      assertError(registry({ protocols, markets: [market({ protocol: name })] }), /lowercase snake_case/);
    }
  });

  it("rejects malformed and unassigned chain IDs", () => {
    for (const id of ["01", "0", "-1", "0x1", "18446744073709551616", "9223372036854775808"]) {
      assertError(registry({ chains: { [id]: { name: "x" } }, markets: [] }), new RegExp(`chains\\["${id}"\\]`));
    }
    assertError(registry({ chains: { "9223372036854775810": { name: "x" } }, markets: [] }), /non-EVM range but is not assigned/);
  });

  it("rejects the wrong schemaVersion", () => {
    assertError(registry({ schemaVersion: 2 as 1 }), /schemaVersion: expected 1, got 2/);
  });
});

describe("findMarket", () => {
  const { entries } = validateRegistry(registry());
  const id = "0x000000000000000000000000c21b08c16458202593d4d9b26b9984ee67b38bbd";

  it("matches marketIds case-insensitively", () => {
    assert.equal(findMarket(entries, "1", id.toUpperCase().replace("0X", "0x"))?.market.name, "Sentora PRIME Main");
  });

  it("requires the chain to match", () => {
    assert.equal(findMarket(entries, "5000", id), undefined);
  });
});
