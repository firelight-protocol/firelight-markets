import assert from "node:assert/strict";
import { test } from "node:test";
import { encode, positionId } from "../src/encode.ts";

const STELLAR = "9223372036854775809";
const account = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const contract = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

const market = (address: string) => ({ chainId: STELLAR, protocol: "x", name: "x", positions: [{ kind: "stellar_address", params: { address } }] });

test("stellar_address: a G… account decodes to its ed25519 public key", () =>
  assert.equal(
    positionId({ kind: "stellar_address", params: { address: account } }),
    "0x3b9911380efe988ba0a8900eb1cfe44f366f7dbe946bed077240f7f624df15c5",
  ));

test("stellar_address: accepts G… accounts and C… contracts", () => {
  encode(market(account));
  encode(market(contract));
});

test("stellar_address: rejects M… muxed accounts", () =>
  assert.throws(() => encode(market("MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJUAAAAAAAAAAAAAAAA"))));

test("stellar_address: rejects an evm_address on the Stellar chain", () =>
  assert.throws(() =>
    encode({ ...market(account), positions: [{ kind: "evm_address", params: { address: "0x0B925eD163218f6662a35e0f0371Ac234f9E9371" } }] }),
  ));
