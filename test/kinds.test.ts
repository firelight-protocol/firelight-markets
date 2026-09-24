// Derivation rules against the frozen vectors in test/vectors/, plus param validation.
//
// The vectors were produced independently of src/: `cast keccak` / `cast abi-encode` (Foundry)
// for EVM kinds, and @stellar/stellar-base for strkeys. Never regenerate them from src/.

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { hexToBytes } from "viem";
import { getKind, KINDS, tagOf, type Params } from "../src/kinds.ts";
import { decodeContractStrkey, encodeContractStrkey } from "../src/stellar.ts";

interface VectorFile {
  kind: string;
  tag?: string;
  vectors: { description: string; chainId: string; params: Params; marketId: string }[];
}

const VECTORS_DIR = new URL("./vectors/", import.meta.url);
const files: VectorFile[] = readdirSync(VECTORS_DIR)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(new URL(name, VECTORS_DIR), "utf8")));

describe("test vectors", () => {
  it("every kind has at least one vector, and every vector file names a known kind", () => {
    const covered = new Set(files.filter((file) => file.vectors.length > 0).map((file) => file.kind));
    assert.deepEqual([...covered].sort(), [...KINDS.keys()].sort());
  });

  for (const file of files) {
    describe(file.kind, () => {
      const kind = getKind(file.kind);

      it(kind.type === "derived" ? "tag is frozen and equals keccak256 of the kind name" : "has no tag", () => {
        assert.equal(kind.tag, file.tag);
        if (kind.type === "derived") assert.equal(kind.tag, tagOf(kind.name));
      });

      for (const vector of file.vectors) {
        it(vector.description, () => {
          assert.equal(kind.marketId(vector.params), vector.marketId);
        });
      }
    });
  }

  it("derived kinds have distinct tags", () => {
    const tags = [...KINDS.values()].flatMap((kind) => (kind.tag ? [kind.tag] : []));
    assert.equal(new Set(tags).size, tags.length);
  });

  it("the borrow and supply sides of one Morpho market differ from each other and from the raw Morpho ID", () => {
    const morphoMarketId = "0x41c41d0c9aadbf4751f5ee215ed5a16954a4b34e1b70fca5393d4b08858fa3fa";
    const borrow = getKind("morpho_blue_borrow.v1").marketId({ morphoMarketId });
    const supply = getKind("morpho_blue_supply.v1").marketId({ morphoMarketId });
    assert.equal(new Set([borrow, supply, morphoMarketId]).size, 3);
  });
});

function rejects(kindName: string, params: Params, message: RegExp) {
  assert.throws(() => getKind(kindName).marketId(params), message);
}

describe("param validation", () => {
  const PRIME_MAIN = "0xC21b08C16458202593D4D9B26b9984Ee67b38BbD";
  const A_WSTETH = "0x0B925eD163218f6662a35e0f0371Ac234f9E9371";
  const VD_USDT = "0x6df1C1E379bC5a00a7b4C6e67A203333772f45A8";
  const VAULT = "CAHEWHOPPDBQYFMAOLDOXXGUX2BCR7EXP4CWYCRY3NEAJB35YPZMMJFF";

  it("rejects missing and unknown params", () => {
    rejects("evm_address", {}, /takes params \{address\}, got \{\}/);
    rejects("evm_address", { address: PRIME_MAIN, extra: "1" }, /takes params \{address\}/);
    rejects("aave_v3_position.v1", { collateralAToken: A_WSTETH }, /takes params/);
  });

  it("rejects addresses that are not checksummed, and suggests the checksum", () => {
    rejects("evm_address", { address: PRIME_MAIN.toLowerCase() }, new RegExp(`expected "${PRIME_MAIN}"`));
    rejects("evm_address", { address: PRIME_MAIN.replace("C21b", "c21B") }, /not checksummed/);
  });

  it("rejects malformed and zero addresses", () => {
    rejects("evm_address", { address: "0x1234" }, /not an EVM address/);
    rejects("evm_address", { address: "0x0000000000000000000000000000000000000000" }, /zero address/);
  });

  it("rejects a zero debt token and identical tokens for Aave positions", () => {
    rejects("aave_v3_position.v1", { collateralAToken: A_WSTETH, debtToken: "0x0000000000000000000000000000000000000000" }, /debtToken: must not be the zero address/);
    rejects("aave_v3_position.v1", { collateralAToken: A_WSTETH, debtToken: A_WSTETH }, /must differ/);
    assert.ok(getKind("aave_v3_position.v1").marketId({ collateralAToken: A_WSTETH, debtToken: VD_USDT }));
  });

  it("rejects Morpho market IDs that are not lowercase bytes32, or zero", () => {
    rejects("morpho_blue_borrow.v1", { morphoMarketId: "0x41C41D0C9AADBF4751F5EE215ED5A16954A4B34E1B70FCA5393D4B08858FA3FA" }, /lowercase hex/);
    rejects("morpho_blue_borrow.v1", { morphoMarketId: "0x41c41d" }, /64 lowercase hex/);
    rejects("morpho_blue_supply.v1", { morphoMarketId: `0x${"0".repeat(64)}` }, /must not be zero/);
  });

  it("rejects malformed Stellar contract strkeys", () => {
    rejects("stellar_contract", { contract: VAULT.slice(0, -1) }, /56 characters/);
    rejects("stellar_contract", { contract: `${VAULT.slice(0, -1)}A` }, /invalid checksum/);
    rejects("stellar_contract", { contract: VAULT.toLowerCase() }, /invalid base32 character/);
    // A valid account (G…) strkey is not a contract.
    rejects("stellar_contract", { contract: "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ" }, /not a contract strkey/);
  });

  it("rejects unknown kinds", () => {
    assert.throws(() => getKind("morpho_blue_borrow"), /unknown kind/);
  });
});

describe("stellar strkeys", () => {
  it("round-trip between strkey and contract ID", () => {
    for (const file of files.filter((f) => f.kind === "stellar_contract")) {
      for (const vector of file.vectors) {
        assert.equal(encodeContractStrkey(hexToBytes(vector.marketId as `0x${string}`)), vector.params.contract);
        assert.deepEqual(decodeContractStrkey(vector.params.contract!), hexToBytes(vector.marketId as `0x${string}`));
      }
    }
  });
});
