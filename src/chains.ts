// Chain IDs (SPECS §3).

export type ChainFamily = "evm" | "stellar";

const UINT64_MAX = 2n ** 64n - 1n;

/** EVM chain IDs are below this value. IDs above it are reserved for non-EVM chains. */
export const NON_EVM_BASE = 2n ** 63n;

/**
 * Non-EVM chain IDs, assigned in order from 2^63 + 1.
 * Append-only: an assigned ID is never reused or changed.
 */
export const NON_EVM_CHAINS: ReadonlyMap<bigint, { family: ChainFamily; name: string }> = new Map([
  [NON_EVM_BASE + 1n, { family: "stellar", name: "Stellar pubnet" }],
]);

/** Parses a chain ID written as a canonical decimal string (no sign, no leading zeros). */
export function parseChainId(value: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`chainId must be a positive decimal string without leading zeros, got "${value}"`);
  }
  const id = BigInt(value);
  if (id > UINT64_MAX) throw new Error(`chainId ${value} does not fit in a uint64`);
  if (id === NON_EVM_BASE) throw new Error(`chainId ${value} (2^63) is not assignable`);
  return id;
}

/** Returns the chain family, or throws if the ID is a non-EVM ID that has not been assigned. */
export function chainFamily(id: bigint): ChainFamily {
  if (id < NON_EVM_BASE) return "evm";
  const chain = NON_EVM_CHAINS.get(id);
  if (!chain) throw new Error(`chainId ${id} is in the non-EVM range but is not assigned`);
  return chain.family;
}
