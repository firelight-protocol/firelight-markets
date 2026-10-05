import { getAddress, isAddress } from "viem";
import { z } from "zod";
import chainIds from "../chainIds.json" with { type: "json" };

const STELLAR_CHAIN_ID = "9223372036854775809"; // 2^63 + 1
// Ids from 2^63 up are reserved for chains we name ourselves (Stellar, Solana, …); below are EVM chains from chainlist.org.
const isEvmChain = (chainId: string) => BigInt(chainId) < 1n << 63n;

const chainId = z.string().refine((value) => value in chainIds, { error: (issue) => `unsupported chainId ${issue.input}` });
const address = z.string().refine((value) => isAddress(value, { strict: false }), "invalid address").transform((value) => getAddress(value));
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "invalid bytes32").transform((value) => value.toLowerCase());
// Strkey of a G… account (ed25519 public key) or a C… contract; both carry a 32-byte payload.
const strkey = z.string().regex(/^[GC][A-Z2-7]{55}$/, "invalid strkey");

type Base = { chainId: string; children?: Position[] };

export type Position = Base &
  (
    | { kind: "evm_address"; params: { address: string } }
    | { kind: "stellar_address"; params: { address: string } }
    | { kind: "morpho_blue_supply.v1" | "morpho_blue_borrow.v1"; params: { morphoMarketId: string } }
    | { kind: "boring_vault.v1"; params: { vault: string; manageRoot: string } }
    | { kind: "twyne_position.v1"; params: { intermediateVault: string; targetVault: string; targetAsset: string } }
  );

const position = <K extends z.ZodType<string>, P extends z.ZodType>(kind: K, params: P) =>
  z.strictObject({
    kind,
    chainId,
    params,
    get children() {
      return z.array(Position).min(1).optional();
    },
  });

export const Position: z.ZodType<Position, unknown> = z
  .discriminatedUnion("kind", [
    position(z.literal("evm_address"), z.strictObject({ address })),
    position(z.literal("stellar_address"), z.strictObject({ address: strkey })),
    position(z.literal(["morpho_blue_supply.v1", "morpho_blue_borrow.v1"]), z.strictObject({ morphoMarketId: bytes32 })),
    position(z.literal("boring_vault.v1"), z.strictObject({ vault: address, manageRoot: bytes32 })),
    // Draft
    position(
      z.literal("twyne_position.v1"),
      z.strictObject({ intermediateVault: address, targetVault: address, targetAsset: address }),
    ),
  ])
  .refine(
    (p) => (p.kind === "stellar_address" ? p.chainId === STELLAR_CHAIN_ID : isEvmChain(p.chainId)),
    { error: (issue) => `${(issue.input as Position).kind} is not a kind of chain ${(issue.input as Position).chainId}` },
  );

export function flatten(position: Position): Position[] {
  return [position, ...(position.children ?? []).flatMap(flatten)];
}

export const Market = z.strictObject({
  chainId,
  protocol: z.string().min(1),
  name: z.string().min(1),
  positions: z.array(Position).min(1),
});

export type Market = z.infer<typeof Market>;
