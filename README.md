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
