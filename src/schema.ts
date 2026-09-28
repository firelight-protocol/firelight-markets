import { getAddress, isAddress } from "viem";
import { z } from "zod";

const STELLAR_CHAIN_ID = "9223372036854775809"; // 2^63 + 1

const address = z.string().refine((value) => isAddress(value, { strict: false }), "invalid address").transform((value) => getAddress(value));
const bytes32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/, "invalid bytes32").transform((value) => value.toLowerCase());
const contract = z.string().regex(/^C[A-Z2-7]{55}$/, "invalid contract");

// Only vaults (evm_address, stellar_contract) may have children.
const children = () => z.array(Position).min(1).optional();

export type Position =
  | { kind: "evm_address"; params: { address: string }; children?: Position[] }
  | { kind: "stellar_contract"; params: { contract: string }; children?: Position[] }
  | { kind: "morpho_blue_supply.v1" | "morpho_blue_borrow.v1"; params: { morphoMarketId: string } }
  | { kind: "twyne_position.v1"; params: { intermediateVault: string; targetVault: string; targetAsset: string } };

export const Position: z.ZodType<Position, unknown> = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("evm_address"),
    params: z.strictObject({ address }),
    get children() {
      return children();
    },
  }),
  z.strictObject({
    kind: z.literal("stellar_contract"),
    params: z.strictObject({ contract }),
    get children() {
      return children();
    },
  }),
  z.strictObject({
    kind: z.literal(["morpho_blue_supply.v1", "morpho_blue_borrow.v1"]),
    params: z.strictObject({ morphoMarketId: bytes32 }),
  }),
  // Draft
  z.strictObject({
    kind: z.literal("twyne_position.v1"),
    params: z.strictObject({ intermediateVault: address, targetVault: address, targetAsset: address }),
  }),
]);

export function flatten(position: Position): Position[] {
  const nested = "children" in position ? (position.children ?? []) : [];
  return [position, ...nested.flatMap(flatten)];
}

export const Market = z
  .strictObject({
    chainId: z.string().regex(/^[1-9][0-9]*$/, "invalid chainId"),
    protocol: z.string().min(1),
    name: z.string().min(1),
    positions: z.array(Position).min(1),
  })
  .refine(
    (market) =>
      market.positions.flatMap(flatten).every((p) => (p.kind === "stellar_contract") === (market.chainId === STELLAR_CHAIN_ID)),
    "kind does not match chain",
  );

export type Market = z.infer<typeof Market>;
