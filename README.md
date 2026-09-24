# Firelight Markets

The public catalogue of every market Firelight sells cover on.

- [`markets.json`](markets.json) is the registry of all markets.
- [`src/`](src) derives a `marketId` from a market's params, and looks up a market from its `marketId`.
- [`SPECS.md`](SPECS.md) is the full specification. This README summarises the rules.

## Quick start

Requires [Bun](https://bun.sh) or Node.js 22.18 or later. The code uses only standard Node APIs, so any package manager works.

```sh
bun install        # or: npm install / pnpm install / yarn
bun test           # or: npm test
bun run typecheck  # or: npm run typecheck
```

With Bun, run the tests with `bun test` rather than `bun run test`.

## Commands

```sh
# Look up a market. Exits with code 1 if it is not registered on that chain.
bun run lookup --chain 1 0x000000000000000000000000c21b08c16458202593d4d9b26b9984ee67b38bbd

# Derive a marketId, and report whether it is registered.
bun run encode --chain 1 --kind evm_address 0xC21b08C16458202593D4D9B26b9984Ee67b38BbD
bun run encode --chain 1 --kind aave_v3_position.v1 \
  collateralAToken=0x0B925eD163218f6662a35e0f0371Ac234f9E9371 \
  debtToken=0x6df1C1E379bC5a00a7b4C6e67A203333772f45A8

# Validate markets.json, listing every error.
bun run validate
```

With npm, put `--` before the arguments, for example `npm run lookup -- --chain 1 0x…`. You can also call the CLI directly with `bun src/cli.ts …` or `node src/cli.ts …`.

`encode` takes params in the kind's order (see [Kinds](#kinds)), or as `name=value` pairs in any order. Lowercase EVM addresses are checksummed for you. Both commands print JSON.

Exit codes: `0` success, `1` market not found or registry invalid (`validate`), `2` bad input.

## Rules

### Identity and scope

A cover pays out if anything in the covered stack is exploited. The stack starts at the position the buyer holds and includes everything their funds flow through. Depeg is covered. Liquidation is not.

- The **marketId** identifies the covered position. It is stable, and a later buyer of the same cover reuses it.
- The **scope** is everything downstream of the position: allocations, allowlists, underlying markets, tokens, off-chain infra. Scope is fixed in the term sheet, signed off-chain, and is not part of the marketId.

On-chain, the cover contract identifies a market by `(chainId, protocol, marketId)`. `(chainId, marketId)` is unique across the registry.

### Chain IDs

`chainId` is a `uint64`. EVM chains use their EIP-155 chain ID. IDs above 2^63 are reserved for non-EVM chains and are assigned in order from 2^63 + 1. The table is append-only, and an assigned ID is never reused or changed.

| Chain | chainId |
|---|---|
| Ethereum | `1` |
| Mantle | `5000` |
| Plasma | `9745` |
| Stellar pubnet | `9223372036854775809` (2^63 + 1) |

Chain IDs are written as decimal strings in JSON, because a `uint64` does not fit safely in a JSON number.

### Protocols

`protocol` is the concentration-cap bucket. Markets in the same bucket share one cap. Buckets are chosen market by market, based on where the real risk lies. Protocol names are lowercase `snake_case` and each is declared once in the registry's `protocols` map. **A market's protocol never changes after registration**, because it is part of the on-chain identity.

### marketId derivation

- **Native kinds:** when the protocol already gives the position a unique identifier of 32 bytes or less, that identifier is the marketId.
- **Derived kinds:** when one identifier is shared by covers that differ, the marketId is `keccak256(abi.encode(TAG, …params))`. `TAG` is `keccak256("<kind>.v<n>")` and is always hashed first, and every encoded value is 32 bytes.

Params contain only what tells covers apart. They never contain values that can be derived from other params, mutable configuration (allowlists, allocations, curator settings), or strategy and leverage. A loop and a borrow with the same collateral and debt are the same position.

**Once any market uses a kind, its rule is frozen.** A change is a new kind with a new tag (`….v2`), and existing marketIds stay valid.

### Kinds

| Kind | Type | Params | Rule |
|---|---|---|---|
| `evm_address` | native | `address` | `bytes32(uint256(uint160(address)))` |
| `stellar_contract` | native | `contract` | the 32-byte contract ID behind the `C…` strkey |
| `morpho_blue_borrow.v1` | derived | `morphoMarketId` | `keccak256(abi.encode(TAG, morphoMarketId))` |
| `morpho_blue_supply.v1` | derived | `morphoMarketId` | `keccak256(abi.encode(TAG, morphoMarketId))` |
| `aave_v3_position.v1` | derived | `collateralAToken`, `debtToken` | `keccak256(abi.encode(TAG, collateralAToken, debtToken))` |

- `evm_address` covers any position identified by one EVM address: a token hold, a vault deposit (Morpho, Veda, Upshift, Mellow), a supply-only position on an Aave v3 fork (the aToken), or off-chain infra grouped behind an EOA.
- `stellar_contract` applies only to Stellar chain IDs. The strkey can always be rebuilt from the marketId.
- `morpho_blue_borrow.v1` covers supplying collateral and borrowing the loan asset, loops included. `morpho_blue_supply.v1` covers lending the loan asset into the market. Neither uses the raw Morpho market ID as the marketId.
- `aave_v3_position.v1` covers one collateral aToken and one variable debt token, on Aave v3 or a fork. The debt token is never zero: a supply-only position uses `evm_address` on the aToken. A fork uses its own `protocol`, for example `spark`.

EVM addresses must be checksummed. `morphoMarketId` is `0x` followed by 64 lowercase hex characters.

## Adding a market

1. Pick the kind and params for the position, following the rules above.
2. Run `encode` to check the params and see whether the market already exists.
3. Add an entry to `markets` in `markets.json`. Declare its protocol under `protocols` and its chain under `chains` if they are new.
4. Run `bun run validate` (or `npm run validate`).

```json
{
  "chainId": "1",
  "protocol": "morpho_vault",
  "kind": "evm_address",
  "params": { "address": "0xC21b08C16458202593D4D9B26b9984Ee67b38BbD" },
  "name": "Sentora PRIME Main",
  "description": "PYUSD lending vault curated by Sentora",
  "url": "https://…"
}
```

`name` is required. `description` and `url` (https only) are optional. Do not add a `marketId` field, because the marketId is always derived from `kind` and `params`.

## Adding a new market type

1. Identify what the covered party holds or interacts with.
2. If the protocol gives that position a unique identifier of 32 bytes or less, it is a native kind.
3. If that identifier is shared by covers that differ (a singleton contract, several sides, several assets), it is a derived kind. Pick the minimal params that tell those covers apart, and name it `<kind>.v1`.
4. Leave out params that can be derived from other params, and anything mutable.
5. Make sure it cannot collide with existing kinds on the same chain.
6. Add the rule to `KINDS` in [`src/kinds.ts`](src/kinds.ts), and to SPECS §5.4 and the Kinds table above.
7. Add `test/vectors/<kind>.json` with fixed inputs and expected marketIds. **Compute the expected values independently of `src/`**, for example with Foundry:

   ```sh
   TAG=$(cast keccak "my_kind.v1")
   cast keccak $(cast abi-encode "f(bytes32,address)" $TAG 0x…)
   ```

   The tests fail if any kind has no vectors.
8. Once a market uses the kind, it is frozen. Never edit its rule or its vectors. A change means a new `.v<n+1>` kind.

## Validation

CI runs the tests on every pull request, under both Bun and Node. The tests check:

- **Uniqueness:** no two markets produce the same `(chainId, marketId)`.
- **References:** every market's `protocol` and `chainId` are declared.
- **Params:** params match their kind's schema, EVM addresses are checksummed, and each kind is used only on its chain family.
- **Test vectors:** every kind reproduces its fixed vectors, so a code change cannot silently alter a frozen rule.

## Layout

```
markets.json                     the registry
src/kinds.ts                     derivation rules
src/chains.ts                    chain ID rules and the non-EVM chain table
src/stellar.ts                   Stellar contract strkey codec
src/registry.ts                  registry loading, validation and lookup
src/cli.ts                       lookup, encode and validate commands
test/vectors/                    frozen test vectors, one file per kind
test/                            vector, registry and CLI tests
legacy/market_mapping_v2.json    original mapping, kept for reference
```

## License

[MIT](LICENSE)
