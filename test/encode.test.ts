import assert from "node:assert/strict";
import { test } from "node:test";
import markets from "./fixtures/markets.json" with { type: "json" };
import { encode } from "../src/encode.ts";

const EXPECTED: Record<string, string> = {
  "PRIME/PYUSD Morpho loop": "0x660cc67a8bd825c8fe23632cab872180d92349125b090a59613f66f5b988cef9",
  "Aave Core wstETH → USDT": "0x5dac10fc8b93af5906131d95c844ae1c99cf69aba511763fb6c0761335b7c823",
  "Aave Core wstETH → WETH": "0x9bb15789b32326b5cc9f22d06b112f53292f49e7f8d87dee38aae97dbac15723",
  "Aave Core rsETH → WETH": "0x7b315ea0a7367d88428631689291c100c28da46155480ce22826ce56170ad239",
  "wstETH/WETH Morpho loop": "0x50d540a6a82e370ca267bfc9f55bee631da55ef457955a158148969b62e1d71d",
  "Spark wstETH → WETH": "0x39e7578f5a97ca925f5e70eb62833a4b99cfd9bc989b4ca6e3a95b6b54bb3ac3",
  "Spark wstETH → USDT": "0x11c524113360278344fdf7c3c1bae76e48c7ce979d20278d7c8e886d5a576e0e",
  "Aave Mantle sUSDe → USDT0": "0x5a700f80c17096a52f2f822981eef2b2993744f8d082b8fbef1cd7d9506b2c7b",
  "Aave Plasma sUSDe → USDT0": "0x271a0abce1978ca9b499fdea56e7f22db629b965b72dde54ce576fa1a0385613",
  "Aave Plasma syrupUSDT → USDT0": "0x9a7bce5e104e812506010ae883912f793000d76ada9eb2952bb60065a66d946d",
  "Hold syrupUSDC": "0xab02532a6e68a6ceb440c609ccb9afdc733e1ce7f989f710822ec6c23a8e4971",
  "Hold syrupUSDT": "0xa162fa32db2e7b35eeb20508d7380bd0721715b87c6101ff7551015be97c9b40",
  "Spark USDC supply": "0x99505a7083b6e3efafd1446496cb0c7fca3e9c2f7a46ad00c22292e50486da31",
  "PST/PYUSD Morpho loop": "0x7112a395ab319f16ce823364a3f198ae1a0871874deee88cb813b6eec2831bd4",
  "sUSDe/PYUSD Morpho loop": "0xd824a300d63b29e8a7ebaaae0ba8fbe1d91b0ef1fbe317d910e65c55057c3862",
  "syrupUSDC/PYUSD Morpho loop": "0xa70bee70d770d8ff512fd2cb5040644565ffd1787f6b4edaeab57f178b445418",
};

for (const market of markets) {
  test(market.name, () => assert.equal(encode(market), EXPECTED[market.name]));
}
