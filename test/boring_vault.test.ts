import assert from "node:assert/strict";
import { test } from "node:test";
import { encode } from "../src/encode.ts";

const vault = "0xf0bb20865277aBd641a307eCe5Ee04E79073416C";
const rootA = "0x22b2736521d52456461e2ab07de304d4482aa6d76a0003076e36700dd997457a";
const rootB = "0x9479189281627a4418f318cc372cb72811aac37b477a30b21de8410cfd231066";
const market = (positions: unknown[]) => ({ chainId: "1", protocol: "boring_vault", name: "test", positions });
const root = (vault: string, manageRoot: string) => ({ kind: "boring_vault.v1", chainId: "1", params: { vault, manageRoot } });

test("boring_vault.v1: one root", () =>
  assert.equal(encode(market([root(vault, rootA)])), "0xb32ebb2e50faae3658a8929396df9ff4807c03786ca1011bedd2dcc0f53fc7e9"));

test("boring_vault.v1: a second root is a different market", () =>
  assert.equal(encode(market([root(vault, rootA), root(vault, rootB)])), "0x85be04739165647d94d4bbbe23be36dedcb8b206c0f17d98267c34394074d723"));

test("boring_vault.v1: order and case do not matter", () =>
  assert.equal(
    encode(market([root(vault.toLowerCase(), rootB.toUpperCase().replace("0X", "0x")), root(vault, rootA)])),
    encode(market([root(vault, rootA), root(vault, rootB)])),
  ));

test("boring_vault.v1: differs from the vault as a plain evm_address", () =>
  assert.notEqual(encode(market([root(vault, rootA)])), encode(market([{ kind: "evm_address", chainId: "1", params: { address: vault } }]))));

