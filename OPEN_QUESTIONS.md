# Open Questions

## 1. Twyne kind and the PT-srUSDe/USDe row

`market_mapping_v2.json` row 14 lists a PT-srUSDe/USDe loop via Twyne, with Pendle and Strata as dependencies. No kind is defined for Twyne yet.

### What the docs say (not verified on-chain)

- Twyne deploys a separate collateral vault for each position via `CollateralVaultFactory.createCollateralVault(VaultType _vaultType, address _intermediateVault, address _targetVault, uint _liqLTV, address _targetAsset)`. That means the collateral vault address cannot serve as the marketId.
- The Vault Manager whitelists the combination `(intermediateVault, targetVault, targetAsset)`. That combination is effectively the market.
- `targetAsset` is ignored when the target is an Euler vault.

### Draft rule

```
twyne_position.v1 → keccak256(abi.encode(TAG, intermediateVault, targetVault, targetAsset))
```

- `targetAsset = address(0)` when the target is Euler.
- `vaultType` is left out because it follows from `targetVault`.
- `liqLTV` is left out because it is leverage (SPECS §5.2).

### To resolve

- Verify the factory signature and the Vault Manager whitelist on-chain.
- Twyne's published addresses list only ETH-type intermediate vaults (eWETH and eWSTETH on Euler, aWSTETH on Aave V3), with nothing for PT-srUSDe or USDe. Confirm which intermediate vault, target vault and target asset row 14 uses, and whether the market exists, is planned, or the row is wrong.
- Once confirmed, add `twyne_position.v1` to SPECS §5.4.

## 2. Suspected duplicate rows

These rows in `market_mapping_v2.json` are identical. Confirm whether each is a real duplicate or a copy-paste error that points to the wrong pool:

- **PYUSD lend into "PayPal USD Main"** (pool 1, rows 12 and 21): one may have been meant to be the Sentora PYUSD Main Morpho vault, which isn't in the pool legend. It could also be the same vault under another name. On-chain, `0xb576…9FB2` is named "Paypal USD Main" with symbol `senPYUSDmain`, and has the same curator as the Huma PST, PRIME and mWIN Main vaults, so it may already be the Sentora PYUSD Main vault.
- **Stellar USDC vault** (pool 16, rows 23 and 24): possibly a second Stellar vault that never got its own pool entry.
- **PRIME/PYUSD Morpho loop** (pool 8, rows 0 and 16): possibly a second Morpho market for the same pair with a different LLTV.

## 3. Protocol buckets for migrated markets

The risk team needs to sign off on these. They are a draft starting point only. `markets.json` currently uses these draft buckets, so they must be final before any market is registered on-chain: a market's protocol never changes after registration.

| Markets | Draft bucket | Notes |
|---|---|---|
| syrupUSDC and syrupUSDT holds | `maple` | |
| PayPal USD Main, Huma PST Main, PRIME Main, mWIN Main | `morpho_vault` | Assumes all four are Morpho vaults. Check PayPal USD Main in particular (see §2). |
| Morpho Blue loops (PRIME/PYUSD, wstETH/WETH, PST/PYUSD, sUSDe/PYUSD, syrupUSDC/PYUSD) | `morpho_market` | |
| Aave V3 Core, Mantle and Plasma loops and borrows | `aave_v3` | One bucket across chains, since the code is shared. |
| Spark loops, borrows and spUSDC supply | `spark` | Spark is an Aave v3 fork. Decide whether it should share `aave_v3` or stay separate. |
| Stellar USDC vault | `stellar_vault` (placeholder) | Which protocol does the vault run on or allocate to? |
| PT-srUSDe/USDe on Twyne | `twyne` | Blocked by §1. |

For each bucket, the display name and description for the `protocols` map also need writing.

## 4. Market metadata

The `description` and `url` fields are optional, but none are filled in yet. Decide who writes them before `markets.json` is published.
