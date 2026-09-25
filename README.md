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

### MetaMorpho v1 (`morpho_vault`)

A MetaMorpho vault is one `evm_address` position for the vault, with a `morpho_blue_supply.v1` child for every market in its withdraw queue (`withdrawQueue(0)` to `withdrawQueue(withdrawQueueLength() - 1)`).

The withdraw queue always contains every market with a non-zero cap and every market the vault still supplies to, so a market whose cap was set to 0 stays in until it is removed from the queue. Caps that are submitted but not yet accepted do not count.

```json
{
  "chainId": "1",
  "protocol": "morpho_vault",
  "name": "<vault name>",
  "positions": [
    {
      "kind": "evm_address",
      "params": { "address": "<vault>" },
      "children": [
        { "kind": "morpho_blue_supply.v1", "params": { "morphoMarketId": "<withdrawQueue(0)>" } },
        { "kind": "morpho_blue_supply.v1", "params": { "morphoMarketId": "<withdrawQueue(1)>" } }
      ]
    }
  ]
}
```

### Morpho Vaults v2

Protocol bucket not decided yet.

A Vaults v2 vault allocates through adapters, and caps decide what each adapter can reach. Caps are set on ids, which are hashes the adapter defines. They are not Morpho Blue market ids, and the vault cannot list them. Find them from the vault's `IncreaseAbsoluteCap`, `DecreaseAbsoluteCap`, `IncreaseRelativeCap` and `DecreaseRelativeCap` events, which carry the `idData` preimage.

An id is open when `absoluteCap(id) > 0` and `relativeCap(id) > 0`, or when `allocation(id) > 0`. The second case covers a cap that was lowered to 0 while funds are still allocated.

The positions are:

- the vault, as an `evm_address`. It holds the idle assets.
- every adapter in `adapters(0)` to `adapters(adaptersLength() - 1)`, as an `evm_address` child of the vault. Removed adapters are left out.
- under a Morpho Market V1 adapter, a `morpho_blue_supply.v1` child for every Blue market whose three ids from `adapter.ids(marketParams)` are all open. The candidates are the markets in the cap events that name this adapter, plus the markets in `marketIds(i)`, or in `marketParamsList(i)` on older adapters. The `morphoMarketId` is the Blue id, `keccak256(abi.encode(marketParams))`, not the vault's id.
- under a Morpho Vault V1 adapter whose `adapterId()` is open, the MetaMorpho vault `morphoVaultV1()` as an `evm_address` child, with its own markets as children as described under MetaMorpho v1.

The adapters only supply, so `morpho_blue_borrow.v1` never appears. Changes that are submitted but not yet executed do not count. If an adapter is neither of the two above, the vault cannot be declared until a rule for that adapter is written here.

```json
{
  "chainId": "1",
  "protocol": "<bucket>",
  "name": "<vault name>",
  "positions": [
    {
      "kind": "evm_address",
      "params": { "address": "<vault>" },
      "children": [
        {
          "kind": "evm_address",
          "params": { "address": "<market adapter>" },
          "children": [
            { "kind": "morpho_blue_supply.v1", "params": { "morphoMarketId": "<Blue market id>" } }
          ]
        },
        {
          "kind": "evm_address",
          "params": { "address": "<vault adapter>" },
          "children": [
            {
              "kind": "evm_address",
              "params": { "address": "<morphoVaultV1()>" },
              "children": [
                { "kind": "morpho_blue_supply.v1", "params": { "morphoMarketId": "<withdrawQueue(0)>" } }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### Mellow Core Vaults

Protocol bucket not decided yet.

A Core Vault keeps idle assets itself and moves them into subvaults. A subvault calls other protocols, and every call is checked by its `verifier()`. A verifier allows calls in two ways: it lists some itself (`allowedCallAt(0)` to `allowedCallAt(allowedCalls() - 1)`), and it accepts proofs against a `merkleRoot()`. This is the same model as a Veda BoringVault's manageRoot. Mellow publishes each subvault's merkle leaves in `scripts/jsons/` of the `mellow-finance/flexible-vaults` repository.

Many Mellow token addresses are share managers, not vaults. If the address has a `vault()` function, start from that vault.

The positions are:

- the vault, as an `evm_address`.
- every subvault in `subvaultAt(0)` to `subvaultAt(subvaults() - 1)`, as an `evm_address` child of the vault.
- under each subvault, every call target that holds funds, as a child. Get the targets from the verifier's `allowedCallAt` entries and from its merkle leaves. For a leaf that points to a custom verifier (such as `SymbioticVerifier`, `EigenLayerVerifier` or `ERC20Verifier`), the targets are the members of its roles, read with `getRoleMember`. For an `ERC20Verifier`, that includes the transfer recipients.
- anything under a target that is itself a vault (another Core Vault, a BoringVault, a MetaMorpho vault), as described in that vault's own section.

The merkle root must be checked before declaring. Rebuild it from the published leaves and compare it with `merkleRoot()`. If they differ, or if any leaf allows any target address, the vault cannot be declared.

Leave out targets that do not hold funds: DEX routers, `SwapModule`, tokens that are only approved, and the deposit or redeem queues and Tellers of other vaults. For those, include the vault they feed into instead. Also leave out the vault's own deposit and redeem queues, the hooks and the oracle.

The vault can also send funds off-chain, for example to a CeFi venue through Copper ClearLoop or Ceffu. In that case, the receiving address is a leaf.

Older Mellow vaults use different contracts:

- A Simple LRT vault (it has a `symbioticVault()` function) is the vault plus `symbioticVault()` and `symbioticCollateral()`.
- A MultiVault (it has a `subvaultsCount()` function) is the vault plus `defaultCollateral()` and each `subvaultAt(i).vault`. For an EigenLayer subvault, also include its strategy, read from `instances(vault)` on the isolated-vault factory, as a child.

```json
{
  "chainId": "1",
  "protocol": "<bucket>",
  "name": "<vault name>",
  "positions": [
    {
      "kind": "evm_address",
      "params": { "address": "<vault>" },
      "children": [
        {
          "kind": "evm_address",
          "params": { "address": "<subvault>" },
          "children": [
            { "kind": "evm_address", "params": { "address": "<Symbiotic vault>" } },
            { "kind": "evm_address", "params": { "address": "<another Core Vault>" } }
          ]
        }
      ]
    }
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
