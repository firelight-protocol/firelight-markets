import { concat, encodeAbiParameters, keccak256, pad, stringToBytes, toHex, type Hex } from "viem";
import { flatten, Market, type Position } from "./schema.ts";

const MARKET_TAG = keccak256(stringToBytes("firelight.market.v1"));

const tagged = (kind: string, types: string[], values: Hex[]) =>
  keccak256(encodeAbiParameters([{ type: "bytes32" }, ...types.map((type) => ({ type }))], [keccak256(stringToBytes(kind)), ...values]));

// Strkey is base32(versionByte ‖ 32-byte contract id ‖ checksum); keep the contract id.
function stellarContractId(strkey: string): Hex {
  let bits = "";
  for (const char of strkey) bits += "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(char).toString(2).padStart(5, "0");
  return toHex(BigInt("0b" + bits.slice(8, 8 + 256)), { size: 32 });
}

export function positionId(position: Position): Hex {
  switch (position.kind) {
    case "evm_address":
      return pad(position.params.address.toLowerCase() as Hex);
    case "stellar_contract":
      return stellarContractId(position.params.contract);
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

/** Parses a registry market and returns its marketId. */
export function encode(json: unknown): Hex {
  const leaves = [...new Set(Market.parse(json).positions.flatMap(flatten).map(positionId))].sort();
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [MARKET_TAG, keccak256(concat(leaves))]));
}

/** Returns each market with its marketId. Throws on a duplicate (chainId, marketId). */
export function registry(markets: unknown[]) {
  const entries = markets.map((market) => ({ marketId: encode(market), ...Market.parse(market) }));
  const keys = entries.map(({ chainId, marketId }) => `${chainId}:${marketId}`);
  if (new Set(keys).size !== keys.length) throw new Error("duplicate (chainId, marketId)");
  return entries;
}
