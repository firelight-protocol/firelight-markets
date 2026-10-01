import assert from "node:assert/strict";
import { test } from "node:test";
import markets from "../markets.json" with { type: "json" };
import { encode } from "../src/encode.ts";

const EXPECTED: Record<string, string> = {
  "PRIME/PYUSD Morpho loop": "0xc11577cf6aafca2ca3749757145adf3d41892ce27810147e5fdafcfc24a68547",
  "Aave Core wstETH → USDT": "0xa777369e19bbbc775ba9d9a3bf3264d7766899bc4f4a20a87df9888a71e5b53d",
  "Aave Core wstETH → WETH": "0x88b4150dfbb64a818ea03eef980301c29bee536255240b5581055d15e514d9e5",
  "Aave Core rsETH → WETH": "0x67b1c9be3b339c080329f74e345ff31eaac01aebf3a0c1f164ffc3ef6db8a495",
  "wstETH/WETH Morpho loop": "0x8ff4120802e493aabb507dfbb2dec2d54175a61676ce10cfe656de01b01186f0",
  "Spark wstETH → WETH": "0xa34cd9546de03c23d19ab1ce5b9dda263f9beadcac0b054dd44b5d201d3f55e3",
  "Spark wstETH → USDT": "0x74a3907e400ae7702ae7e47d9ca008016a16b36b71b453070a7fffed8ee59551",
  "Aave Mantle sUSDe → USDT0": "0x02af95ebffca66ee953bf080f97cd87047d4a17897b16e52c82b259882d3a85e",
  "Aave Plasma sUSDe → USDT0": "0xbe7c230070ba236066e286f26973995e8a349201091278a2c471ef9694b47254",
  "Aave Plasma syrupUSDT → USDT0": "0xabd062b643449e35baab597cc9aecb8f299edcf34ad768e6db381445f7ef7ed8",
  "Hold syrupUSDC": "0x97b9d72cf48eab94597dfa490cb88949a57ffc20163b09a8e4f2f75edf43f821",
  "Hold syrupUSDT": "0x483ea6f0d5e31efc979bab8d0cdc56afca2f1eb4b9e450b48a5a352a307a312f",
  "Spark USDC supply": "0x1fc097f101fb192f2a333c762160f2302448136b99d507e269112bc3eea09b5b",
  "PST/PYUSD Morpho loop": "0xc32052327a23ff0936cd3963e2f02228569ac136dd9ae66977e6e23341306d85",
  "sUSDe/PYUSD Morpho loop": "0x65c2eb86c6a497916bc70378ad7c048e370b7c1c2820b411ed7de49afe7d12ef",
  "syrupUSDC/PYUSD Morpho loop": "0xa46a0eaaf16cd7f75edf52ba6ba7c467746a58b4356ad58dddcaf4286156d9ad",
  "Test-Vault": "0xb05cd84c889f25574458cbd35125f519a126431858ec5e54158daa7b364a32cb",
};

for (const market of markets) {
  test(market.name, () => assert.equal(encode(market), EXPECTED[market.name]));
}
