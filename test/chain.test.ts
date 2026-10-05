import assert from "node:assert/strict";
import { test } from "node:test";
import { encode } from "../src/encode.ts";

const STELLAR = "9223372036854775809";
const vault = "0xf0bb20865277aBd641a307eCe5Ee04E79073416C";
const sub = "0x0B925eD163218f6662a35e0f0371Ac234f9E9371";
const account = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const contract = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const evm = (chainId: string, address: string, children?: unknown[]) => ({
  kind: "evm_address",
  chainId,
  params: { address },
  ...(children && { children }),
});
const stellar = (address: string, children?: unknown[]) => ({
  kind: "stellar_address",
  chainId: STELLAR,
  params: { address },
  ...(children && { children }),
});
const market = (positions: unknown[], chainId = "1") => ({ chainId, protocol: "x", name: "x", positions });

test("chainId: the same address on two chains is two different markets", () =>
  assert.notEqual(encode(market([evm("1", vault, [evm("8453", sub)])])), encode(market([evm("1", vault, [evm("42161", sub)])]))));

test("chainId: a vault allocating to both copies has two leaves", () =>
  assert.notEqual(encode(market([evm("1", vault, [evm("8453", sub), evm("42161", sub)])])), encode(market([evm("1", vault, [evm("8453", sub)])]))));

test("chainId: children may be on any chain, nested freely", () => {
  encode(market([evm("1", vault, [stellar(account, [stellar(contract, [evm("8453", sub)])])])]));
});

test("chainId: unsupported chainIds are rejected", () => {
  assert.throws(() => encode(market([evm("1", vault)], "2")), /unsupported chainId 2/);
  assert.throws(() => encode(market([evm("1", vault, [evm("999", sub)])])), /unsupported chainId 999/);
});

test("chainId: EVM kinds are rejected on a non-EVM chain", () =>
  assert.throws(() => encode(market([evm("1", vault, [evm(STELLAR, sub)])])), /not a kind of chain/));

test("chainId: is required", () => assert.throws(() => encode(market([{ kind: "evm_address", params: { address: vault } }]))));
