# Firelight markets

The registry of markets that Firelight covers, and the code that derives each market's `marketId`.

On-chain, a market is identified by the triple `(chainId, protocol, marketId)`. This repository defines how the `marketId` is derived and lists every market that has been declared.

The published list is [`registry.json`](registry.json).

## marketId

A `marketId` is the hash of the set of positions a cover includes:

```
leaves   = sort(unique(positionId(p) for p in positions))
marketId = keccak256(abi.encode(keccak256("firelight.market.v1"), keccak256(concat(leaves))))
```

A position is anything that can be identified with 32 bytes, such as a vault, a token holding, or one side of a Morpho Blue market. A cover on a vault includes the vault itself, every position it allocates to, and so on down to the leaves. Only the set of positions is hashed, so their order and nesting do not affect the `marketId`.

Perils, thresholds, limits, premium, dates and the buyer are not part of the `marketId`. They belong to the term sheet, which is signed off-chain.

The full design is in [PROPOSAL.md](PROPOSAL.md).

## Kinds

A kind turns a protocol-specific description of a position into a 32-byte `positionId`.

| Kind | Params | Used for |
|---|---|---|
| `evm_address` | `address` | vaults, token holdings, Aave and Spark aTokens and variable-debt tokens |
| `stellar_contract` | `contract` (`C…` strkey) | Soroban vaults |
| `morpho_blue_supply.v1` | `morphoMarketId` | lending into a Morpho Blue market |
| `morpho_blue_borrow.v1` | `morphoMarketId` | borrowing from a Morpho Blue market, including loops |
| `twyne_position.v1` (draft) | `intermediateVault`, `targetVault`, `targetAsset` | Twyne positions |

Only `evm_address` and `stellar_contract` positions may have `children`, which are the positions a vault allocates to.

## Cookbook

The same cover must always be described by the same set of positions, or it gets a different `marketId`. This section lists which positions to include for each protocol. The order of positions and the case of addresses do not matter.

If a protocol is not listed, add a section here in the same PR as its first market.

### Aave v3 (`aave_v3`)

A supply is one `evm_address` position: the aToken of the supplied asset.

A loop or borrow is two `evm_address` positions:

- the aToken of the collateral asset
- the variable-debt token of the borrowed asset

Do not include the Pool, the underlying asset or the stable-debt token. To find the addresses, call `Pool.getReserveData(asset)` and read `aTokenAddress` and `variableDebtTokenAddress`, or look them up in the Aave address book.

```json
{
  "chainId": "1",
  "protocol": "aave_v3",
  "name": "Aave Core wstETH → USDT",
  "positions": [
    { "kind": "evm_address", "params": { "address": "0x0B925eD163218f6662a35e0f0371Ac234f9E9371" } },
    { "kind": "evm_address", "params": { "address": "0x6df1C1E379bC5a00a7b4C6e67A203333772f45A8" } }
  ]
}
```

The first position is the aEthwstETH token (collateral) and the second is the variableDebtEthUSDT token (debt).

### Spark (`spark`)

Spark is a fork of Aave v3, so the rules are the same. Use the spToken of the supplied or collateral asset, plus the variable-debt token of the borrowed asset for a loop. Find the addresses with `Pool.getReserveData(asset)` on the Spark Pool.

```json
{
  "chainId": "1",
  "protocol": "spark",
  "name": "Spark USDC supply",
  "positions": [
    { "kind": "evm_address", "params": { "address": "0x377C3bd93f2a2984E1E7bE6A5C22c525eD4A4815" } }
  ]
}
```

### Morpho Blue (`morpho_market`)

A Morpho Blue market is identified by its `morphoMarketId`, which is the `Id` shown in the Morpho app and emitted in `CreateMarket`. It is `keccak256(abi.encode(marketParams))`.

- For supplying into a market, use one `morpho_blue_supply.v1` position.
- For a borrow or loop, use one `morpho_blue_borrow.v1` position. The collateral is part of the market parameters, so do not add a separate position for it.

```json
{
  "chainId": "1",
  "protocol": "morpho_market",
  "name": "wstETH/WETH Morpho loop",
  "positions": [
    { "kind": "morpho_blue_borrow.v1", "params": { "morphoMarketId": "0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e" } }
  ]
}
```

### Maple (`maple`)

Holding a Maple syrup token is one `evm_address` position: the address of the syrup token, which is also the pool. Do not include the underlying asset or the pool manager.

```json
{
  "chainId": "1",
  "protocol": "maple",
  "name": "Hold syrupUSDC",
  "positions": [
    { "kind": "evm_address", "params": { "address": "0x80ac24aA929eaF5013f6436cdA2a7ba190f5Cc0b" } }
  ]
}
```

## Files

| File | Purpose |
|---|---|
| `markets.json` | The source list of markets. Edit this file to add or change a market. |
| `registry.json` | The published list, generated from `markets.json` with each `marketId` included. Do not edit it by hand. |
| `src/schema.ts` | Schema for a market |
| `src/encode.ts` | `positionId` and `marketId` derivation |
| `legacy/` | The previous market mapping, kept for reference |

## Usage

Requires Node.js 20 or later.

```sh
npm install
npm run encode -- markets.json           # print the marketId of each market
npm run encode -- markets.json --write   # regenerate registry.json
npm run lookup -- <marketId>             # print the markets with that marketId and their positions
npm test
```

## Adding a market

1. Add the market to `markets.json`:

   ```json
   {
     "chainId": "1",
     "protocol": "morpho_market",
     "name": "PRIME/PYUSD Morpho loop",
     "positions": [
       { "kind": "morpho_blue_borrow.v1", "params": { "morphoMarketId": "0x41c41d0c9aadbf4751f5ee215ed5a16954a4b34e1b70fca5393d4b08858fa3fa" } }
     ]
   }
   ```

2. Regenerate `registry.json`:

   ```sh
   npm run encode -- markets.json --write
   ```

   This fails if a market does not match the schema, or if two markets share a `(chainId, marketId)` pair.

3. Run `npm test`. It fails if `registry.json` is out of date.

4. Commit `markets.json` and `registry.json` together.
