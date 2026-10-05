import { concat, encodeAbiParameters, type Hex, keccak256, pad, stringToBytes, toHex } from "viem";
import { flatten, Market, type Position } from "./schema.ts";

const MARKET_TAG = keccak256(stringToBytes("firelight.market.v1"));

const tagged = (kind: string, types: string[], values: Hex[]) =>
  keccak256(encodeAbiParameters([{ type: "bytes32" }, ...types.map((type) => ({ type }))], [keccak256(stringToBytes(kind)), ...values]));

// Strkey is base32(versionByte ‖ 32-byte payload ‖ checksum); keep the payload (ed25519 key or contract id).
function stellarPayload(strkey: string): Hex {
  let bits = "";
  for (const char of strkey) bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char).toString(2).padStart(5, "0");
  return toHex(BigInt(`0b${bits.slice(8, 8 + 256)}`), { size: 32 });
}

/** Identifies a position within its chain. */
export function positionId(position: Position): Hex {
  switch (position.kind) {
    case "evm_address":
      return pad(position.params.address.toLowerCase() as Hex);
    case "stellar_address":
      return stellarPayload(position.params.address);
    case "morpho_blue_supply.v1":
    case "morpho_blue_borrow.v1":
      return tagged(position.kind, ["bytes32"], [position.params.morphoMarketId as Hex]);
    case "boring_vault.v1":
      return tagged(position.kind, ["address", "bytes32"], [position.params.vault, position.params.manageRoot] as Hex[]);
    case "twyne_position.v1": {
      const { intermediateVault, targetVault, targetAsset } = position.params;
      return tagged(position.kind, ["address", "address", "address"], [intermediateVault, targetVault, targetAsset] as Hex[]);
    }
  }
}

/** Identifies a position globally: the same address on two chains is two leaves. */
export const leaf = (position: Position): Hex =>
  keccak256(encodeAbiParameters([{ type: "uint256" }, { type: "bytes32" }], [BigInt(position.chainId), positionId(position)]));

/** Parses a registry market and returns its marketId. */
export function encode(json: unknown): Hex {
  const leaves = [...new Set(Market.parse(json).positions.flatMap(flatten).map(leaf))].sort();
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [MARKET_TAG, keccak256(concat(leaves))]));
}

/** Returns each market with its marketId. Throws on a duplicate (chainId, marketId). */
export function registry(markets: unknown[]) {
  const entries = markets.map((market) => ({ marketId: encode(market), ...Market.parse(market) }));
  const keys = entries.map(({ chainId, marketId }) => `${chainId}:${marketId}`);
  if (new Set(keys).size !== keys.length) throw new Error("duplicate (chainId, marketId)");
  return entries;
}
