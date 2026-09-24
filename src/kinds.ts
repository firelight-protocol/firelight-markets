// marketId derivation rules (SPECS §5).
//
// Once any market uses a kind, its rule is frozen: change it by adding a new `.v<n+1>` kind,
// never by editing an existing one. The vectors in test/vectors/ guard this.

import { bytesToHex, encodeAbiParameters, getAddress, isAddress, keccak256, pad, stringToBytes, zeroAddress, type Hex } from "viem";
import type { ChainFamily } from "./chains.ts";
import { decodeContractStrkey } from "./stellar.ts";

export type Params = Record<string, string>;

export interface Kind {
  readonly name: string;
  readonly type: "native" | "derived";
  /** The only chain family this kind may be used on. */
  readonly family: ChainFamily;
  /** Param names, in the order the CLI accepts them positionally. */
  readonly params: readonly string[];
  /** keccak256("<kind>.v<n>"), for derived kinds only. */
  readonly tag?: Hex;
  /** Checks `params` against the kind's schema and returns the marketId. Throws on invalid params. */
  marketId(params: Params): Hex;
}

/** keccak256 of the kind name, e.g. keccak256("aave_v3_position.v1"). */
export function tagOf(kindName: string): Hex {
  return keccak256(stringToBytes(kindName));
}

function checkedAddress(params: Params, key: string): Hex {
  const value = params[key]!;
  if (!isAddress(value, { strict: false })) throw new Error(`${key}: "${value}" is not an EVM address`);
  const checksummed = getAddress(value);
  if (value !== checksummed) throw new Error(`${key}: "${value}" is not checksummed, expected "${checksummed}"`);
  if (value === zeroAddress) throw new Error(`${key}: must not be the zero address`);
  return checksummed;
}

function checkedBytes32(params: Params, key: string): Hex {
  const value = params[key]!;
  if (!/^0x[0-9a-f]{64}$/.test(value)) throw new Error(`${key}: "${value}" must be 0x followed by 64 lowercase hex characters`);
  if (/^0x0+$/.test(value)) throw new Error(`${key}: must not be zero`);
  return value as Hex;
}

function define(kind: Omit<Kind, "marketId" | "tag">, derive: (params: Params) => Hex): Kind {
  const tag = kind.type === "derived" ? tagOf(kind.name) : undefined;
  return {
    ...kind,
    tag,
    marketId(params) {
      const expected = [...kind.params].sort().join(", ");
      const actual = Object.keys(params).sort().join(", ");
      if (expected !== actual) throw new Error(`${kind.name} takes params {${expected}}, got {${actual}}`);
      for (const [key, value] of Object.entries(params)) {
        if (typeof value !== "string") throw new Error(`${key}: must be a string`);
      }
      return derive(params);
    },
  };
}

function hashWithTag(tag: Hex, types: ("bytes32" | "address")[], values: Hex[]): Hex {
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, ...types.map((type) => ({ type }))], [tag, ...values]));
}

const evmAddress = define(
  { name: "evm_address", type: "native", family: "evm", params: ["address"] },
  (params) => pad(checkedAddress(params, "address").toLowerCase() as Hex, { size: 32 }),
);

const stellarContract = define(
  { name: "stellar_contract", type: "native", family: "stellar", params: ["contract"] },
  (params) => {
    try {
      return bytesToHex(decodeContractStrkey(params.contract!));
    } catch (error) {
      throw new Error(`contract: ${(error as Error).message}`);
    }
  },
);

function morphoBlue(name: string): Kind {
  const kind = define({ name, type: "derived", family: "evm", params: ["morphoMarketId"] }, (params) =>
    hashWithTag(kind.tag!, ["bytes32"], [checkedBytes32(params, "morphoMarketId")]),
  );
  return kind;
}

const aaveV3Position: Kind = define(
  { name: "aave_v3_position.v1", type: "derived", family: "evm", params: ["collateralAToken", "debtToken"] },
  (params) => {
    const collateral = checkedAddress(params, "collateralAToken");
    const debt = checkedAddress(params, "debtToken");
    if (collateral === debt) throw new Error("collateralAToken and debtToken must differ");
    return hashWithTag(aaveV3Position.tag!, ["address", "address"], [collateral, debt]);
  },
);

export const KINDS: ReadonlyMap<string, Kind> = new Map(
  [evmAddress, stellarContract, morphoBlue("morpho_blue_borrow.v1"), morphoBlue("morpho_blue_supply.v1"), aaveV3Position].map(
    (kind) => [kind.name, kind],
  ),
);

export function getKind(name: string): Kind {
  const kind = KINDS.get(name);
  if (!kind) throw new Error(`unknown kind "${name}", expected one of: ${[...KINDS.keys()].join(", ")}`);
  return kind;
}
