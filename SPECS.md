# Firelight Markets: Specification

Unresolved questions live in [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md).

## 1. Purpose

This repository is the public catalogue of every market Firelight sells cover on. It contains:

- `markets.json`, the registry of all markets
- a small TypeScript program to derive a `marketId` from a market's params, and to look up a market's metadata from a `marketId`
- a README explaining the rules, including how to add a new market type

The cover smart contract is already deployed and is out of scope.

## 2. Core concepts

### 2.1 Cover

A cover is a promise to pay, up to an agreed amount, if anything in the covered stack is exploited. The stack is everything the buyer's funds flow through, starting from the position they hold. For example, a cover on a Veda vault that allocates to Morpho vaults includes the Veda vault contract, the Morpho vault contracts, the Morpho markets and their loan and collateral tokens, and any off-chain infra.

Depeg is in scope. Liquidation is out of scope, because an honest liquidation cannot be reliably told apart from a manipulated one.

### 2.2 Identity vs scope

- The **marketId** is a stable, unique identifier for the covered position. It is what the contract uses to tell covers apart. A later buyer of the same cover reuses the same marketId.
- The **scope** is everything downstream of the position: allocations, allowlists, underlying markets, tokens, off-chain infra. Scope is not part of the marketId.
- Scope is fixed in the **term sheet**, which is signed off-chain. If the scope changes (for example, a vault changes its allowlist), the terms say the cover becomes invalid. The marketId itself does not change.

### 2.3 On-chain identity

The contract identifies a market by three values:

| Field | Type | Meaning |
|---|---|---|
| `chainId` | `uint64` | The chain the position lives on (§3) |
| `protocol` | `string` | Concentration-cap bucket (§4) |
| `marketId` | `bytes32` | The covered position (§5) |

Chain is not encoded inside the marketId. `(chainId, marketId)` is unique across the registry.

## 3. Chain IDs

- `chainId` is a `uint64`.
- EVM chains use their standard EIP-155 chain ID. EIP-2294 keeps every valid EVM chain ID below 2^63.
- Values above 2^63 are reserved for non-EVM chains. They are assigned in order starting at 2^63 + 1, in an append-only table. An assigned ID is never reused or changed.
- Only mainnets are listed. Testnets can be appended later if ever needed.

| Chain | chainId |
|---|---|
| Ethereum | `1` |
| Mantle | `5000` |
| Plasma | `9745` |
| Stellar pubnet | `9223372036854775809` (2^63 + 1) |

## 4. Protocol (concentration buckets)

`protocol` exists only to apply concentration caps. For example, a capital vault may sell cover worth at most 50% of its collateral on markets in the `morpho_vault` bucket. Markets in the same bucket share one cap.

Buckets are chosen market by market, based on where the real risk lies. There is no fixed grouping rule.

- Two Morpho vaults from different curators that share their risky components would normally share `morpho_vault`.
- Two markets whose shared components are low-risk, but whose real risk sits in different components, get different buckets.

Format rules:

- lowercase `snake_case`
- every protocol is declared once in the registry's `protocols` map, with a display name and description
- a market may only reference a declared protocol (enforced by CI)
- a market's protocol never changes after it is registered, because it is part of the on-chain identity

## 5. marketId derivation

### 5.1 Principle

The marketId must tell apart every cover the contract has to treat differently.

- **Native kinds:** when the protocol already gives the position a unique identifier of 32 bytes or less, that identifier is the marketId.
- **Derived kinds:** when one on-chain identifier is shared by covers that differ (for example a singleton pool, or the two sides of one market), the marketId is a hash of a tag plus the minimal params that tell those covers apart.

Rules are defined only for the kinds present in the registry. A new kind is added when a new type of market is needed (§5.5).

### 5.2 What goes into params

- Only params that tell covers apart.
- No params that can be derived from other params. For example, an aToken already implies its underlying asset and pool.
- No mutable configuration: allowlists, allocations, curator settings.
- No strategy or leverage. A loop and a borrow with the same collateral and debt are the same position. Leverage only matters for liquidation, which is not covered.

### 5.3 Tags and versioning

Every derived kind has a tag: a `bytes32` constant equal to the keccak256 of the string `<kind>.v<n>`. The tag is always the first value hashed:

```solidity
bytes32 constant AAVE_V3_POSITION_V1 = keccak256("aave_v3_position.v1");
marketId = keccak256(abi.encode(AAVE_V3_POSITION_V1, collateralAToken, debtToken));
```

- Every value in the encoding is a fixed 32 bytes, so the rule can be reproduced in any language.
- The tag keeps kinds apart, so two kinds that take the same param types can never produce the same marketId.
- The tag carries the version. **Once any market uses a kind's rule, that rule is frozen.** A change becomes a new kind with a new tag (`….v2`), and existing marketIds stay valid.
- A tag cannot be recovered from a marketId. Looking up a marketId always goes through the registry.

### 5.4 Kinds

| Kind | Type | Rule |
|---|---|---|
| `evm_address` | native | `bytes32(uint256(uint160(addr)))`, left-padded with zeros |
| `stellar_contract` | native | the 32-byte contract ID behind the `C…` strkey |
| `morpho_blue_borrow.v1` | derived | `keccak256(abi.encode(TAG, morphoMarketId))` |
| `morpho_blue_supply.v1` | derived | `keccak256(abi.encode(TAG, morphoMarketId))` |
| `aave_v3_position.v1` | derived | `keccak256(abi.encode(TAG, collateralAToken, debtToken))` |

Native kinds have no tag and no version, because their rule is just the protocol's own identifier.

#### `evm_address`

Covers any position identified by a single EVM address:

- holding a token (for example syrupUSDC)
- depositing into a vault (Morpho, Veda, Upshift or Mellow vaults), since the vault address is the marketId and everything the vault allocates to is scope
- a supply-only position on an Aave v3 fork, identified by its aToken (for example Spark spUSDC)
- off-chain infra covered on its own, grouped behind an EOA

Params: `{ "address": "<checksummed 0x address>" }`

Example: Sentora PRIME Main `0xC21b08C16458202593D4D9B26b9984Ee67b38BbD` gives
`0x000000000000000000000000c21b08c16458202593d4d9b26b9984ee67b38bbd`.

#### `stellar_contract`

A Stellar (Soroban) contract, such as a vault. The `C…` strkey is base32-decoded, and the version byte and 2-byte checksum are dropped. What's left is the 32-byte contract ID, and that is the marketId. The conversion can be reversed, so the strkey can always be rebuilt from the marketId. This kind applies only to Stellar chain IDs.

Params: `{ "contract": "C…" }`

#### `morpho_blue_borrow.v1` and `morpho_blue_supply.v1`

Morpho Blue is a singleton contract. Each market has a native bytes32 ID, `keccak256(abi.encode(loanToken, collateralToken, oracle, irm, lltv))`, and markets are isolated from each other. One Morpho market holds two different covers, so each side has its own kind and tag:

- `morpho_blue_borrow.v1`: supply collateral and borrow the loan asset. This includes loops.
- `morpho_blue_supply.v1`: lend the loan asset directly into the market.

Neither side uses the raw Morpho market ID as the marketId.

Params: `{ "morphoMarketId": "0x<32 bytes>" }`

#### `aave_v3_position.v1`

Aave v3 and its forks (such as Spark) use one singleton Pool per deployment, with no per-market ID. A borrow position is identified by its collateral aToken and its variable debt token. Each token already implies the pool, the chain deployment and its underlying asset.

- The debt token is never zero. A supply-only position uses `evm_address` on the aToken instead.
- The rule covers one collateral asset and one debt asset. A position with several collateral or debt assets needs a new kind.
- A fork uses this kind with its own `protocol`. For example, Spark positions are `aave_v3_position.v1` with `protocol: "spark"`.

Params: `{ "collateralAToken": "<checksummed 0x address>", "debtToken": "<checksummed 0x address>" }`

### 5.5 Adding a new market type

1. Identify what the covered party holds or interacts with.
2. Does the protocol give that position a unique identifier of 32 bytes or less? If yes, it is a native kind.
3. Is that identifier shared by covers that differ (a singleton contract, several sides, several assets)? If yes, it is a derived kind: pick the minimal params that tell them apart, and give it a tag `<kind>.v1`.
4. Leave out params that can be derived from others, and anything mutable (§5.2).
5. Make sure it cannot collide with existing kinds on the same chain.
6. Add test vectors for the new kind.
7. Once a kind is used, it is frozen. A change means a new `.v<n+1>` kind.

## 6. Registry: `markets.json`

### 6.1 Layout

```json
{
  "schemaVersion": 1,
  "chains": {
    "1": { "name": "Ethereum" },
    "5000": { "name": "Mantle" },
    "9745": { "name": "Plasma" },
    "9223372036854775809": { "name": "Stellar" }
  },
  "protocols": {
    "morpho_vault": { "name": "Morpho Vault", "description": "…" }
  },
  "markets": [
    {
      "chainId": "1",
      "protocol": "morpho_vault",
      "kind": "evm_address",
      "params": { "address": "0xC21b08C16458202593D4D9B26b9984Ee67b38BbD" },
      "name": "Sentora PRIME Main",
      "description": "PYUSD lending vault curated by Sentora",
      "url": "https://…"
    }
  ]
}
```

- `schemaVersion` changes only when the file format changes in a way that breaks existing readers. It has nothing to do with kind versions.
- `chains` keys are decimal strings, because a uint64 does not fit safely in a JSON number.
- In each market, `chainId` is a decimal string for the same reason. `name` is required, and `description` and `url` are optional.
- The `marketId` is **not stored**. It is always derived from `kind` and `params`.
- There is no `status` field. The market lifecycle is not tracked in this repo.

### 6.2 Validation (CI)

Every PR runs:

- **Uniqueness:** no two markets produce the same `(chainId, marketId)`.
- **References:** every market's `protocol` and `chainId` are declared.
- **Params:** params match their kind's schema, and EVM addresses are checksummed.
- **Test vectors:** each kind has fixed inputs with expected marketIds, so a code change cannot silently alter a frozen rule.

## 7. Program

TypeScript, using viem for keccak, ABI encoding and address checksums. It runs straight from the repo and is not published as a package. There is no Solidity reference implementation. The test vectors are the specification's source of truth.

Commands:

- `lookup --chain <chainId> <marketId>`: prints the market's entry and its protocol. `chainId` is required. Exits with a non-zero code if the market is not found.
- `encode --chain <chainId> --kind <kind> <params…>`: prints the marketId, and whether that market is already registered.

## 8. Repository layout

```
markets.json
README.md
SPECS.md
OPEN_QUESTIONS.md
LICENSE                          MIT
src/                             derivation rules, lookup, encode CLI
test/                            test vectors per kind, registry validation
legacy/market_mapping_v2.json    original mapping, kept for reference
```

## 9. Migration of `market_mapping_v2.json`

The old fields `assets`, `vault`, `cpi`, `strategy` and `poolId` are replaced by `kind` + `params`. What they described is scope, which lives in the term sheet. After migration the file moves to `legacy/`.

Row numbers are 0-based indices into `rows`.

| Rows | Market | Kind |
|---|---|---|
| 10, 11 | syrupUSDC and syrupUSDT holds (Ethereum) | `evm_address` (token) |
| 12, 15, 17, 18 | PYUSD into PayPal USD Main, Huma PST Main, PRIME Main, mWIN Main | `evm_address` (vault) |
| 13 | USDC supply to Spark spUSDC | `evm_address` (aToken) |
| 23 | Stellar USDC vault | `stellar_contract` |
| 0, 4, 19, 20, 22 | Morpho loops: PRIME/PYUSD, wstETH/WETH, PST/PYUSD, sUSDe/PYUSD, syrupUSDC/PYUSD | `morpho_blue_borrow.v1` |
| 1, 2, 3 | Aave V3 Core (Ethereum): wstETH/USDT borrow, wstETH/WETH loop, rsETH/WETH loop | `aave_v3_position.v1` |
| 5, 6 | Spark (Ethereum): wstETH/WETH loop, wstETH/USDT borrow | `aave_v3_position.v1` |
| 7 | Aave V3 Mantle: sUSDe/USDT0 loop | `aave_v3_position.v1` |
| 8, 9 | Aave V3 Plasma: sUSDe/USDT0 loop, syrupUSDT/USDT0 loop | `aave_v3_position.v1` |
| 14 | PT-srUSDe/USDe loop on Twyne | no kind yet (see OPEN_QUESTIONS.md) |
| 16, 21, 24 | suspected duplicates of rows 0, 12, 23 | see OPEN_QUESTIONS.md |

Protocol buckets for these markets are drafted in OPEN_QUESTIONS.md and need sign-off from the risk team.
