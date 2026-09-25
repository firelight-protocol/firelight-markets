# Proposal: marketId as the hash of the covered positions

If accepted, this proposal replaces SPECS §2.2 (identity vs scope), §5 (marketId derivation) and §9 (migration). The chain IDs, protocol buckets and the on-chain `(chainId, protocol, marketId)` triple are unchanged.

## 1. Summary

The current SPECS sets the marketId to the entry contract and treats everything downstream as term-sheet scope. That breaks in two cases:

- A BoringVault that changes strategy keeps the same marketId.
- One BoringVault buying two covers at the same time (a safe strategy and a risky one) cannot get two marketIds.

The proposed rule:

> **marketId = the hash of the set of positions the cover includes.**

A position is anything a *kind* can identify with 32 bytes: a vault, a token hold, a supply or borrow side of a Morpho market, an Aave aToken or debt token. A cover on a BoringVault includes the vault itself, every vault it allocates to, and every position those vaults hold, down to the first position that doesn't allocate further. The set is flattened, deduplicated, sorted and hashed.

Everything else stays in the term sheet, which is signed off-chain: perils, depeg thresholds, limits, premium, dates and the buyer.

## 2. Kinds

A kind turns a protocol-specific description of a position into a 32-byte `positionId`. Kinds are the only protocol-specific code. The marketId rule (§3) never changes when a protocol is added.

There are two patterns:

- **Native**: the protocol already gives the position a unique id of 32 bytes or less, so that id is the positionId. There is no tag and no version.
- **Derived**: one on-chain id is shared by positions that differ, such as the two sides of a Morpho market. The positionId is `keccak256(abi.encode(keccak256("<kind>.v<n>"), ...params))`. The tag separates the kinds, and it carries the version.

### 2.1 Kinds needed for the legacy mapping

| Kind | Type | Params | positionId | Covers |
|---|---|---|---|---|
| `evm_address` | native | `address` | `bytes32(uint256(uint160(address)))` | vaults, token holds, Aave aTokens and variable-debt tokens |
| `stellar_contract` | native | `contract` (`C…` strkey) | the 32-byte contract id behind the strkey | Soroban vaults |
| `morpho_blue_supply.v1` | derived | `morphoMarketId` | `keccak256(abi.encode(TAG, morphoMarketId))` | lending the loan token into a Morpho Blue market |
| `morpho_blue_borrow.v1` | derived | `morphoMarketId` | `keccak256(abi.encode(TAG, morphoMarketId))` | posting collateral and borrowing in a Morpho Blue market, including loops |

`aave_v3_position.v1` from the current SPECS is **removed**, because Aave positions are expressed as `evm_address` leaves (§2.3).

Legacy row 14 (the PT-srUSDe/USDe loop on Twyne) needs one more kind, `twyne_position.v1`, which is blocked on OPEN_QUESTIONS §1 (see §2.6).

The legacy legend's other fields don't need kinds:

- **`vaults` (Upshift, Veda, Mellow):** these are all `evm_address`. The vault name was only a label.
- **`cpis` (Twyne, Pendle, Strata):**
  - Pendle PTs and Strata tranches are tokens, so they're `evm_address` holds.
  - Twyne is the only one that needs its own kind.
- **`strategy` (hold, lend, loop, borrow, LP):** strategy is now expressed by which kinds appear in the set.
  - Hold and lend are an `evm_address` or a `morpho_blue_supply`.
  - Loop and borrow are a `morpho_blue_borrow`, or an aToken plus a debt token.
  - LP will be an LP kind when one is needed (§2.7).

### 2.2 `evm_address`

- **One kind for every contract role.** A vault, a token, an aToken and a debt token all produce the same positionId shape. The role is visible in the registry's human-readable tree, but it is never hashed, because an address can only be one contract.
- **Params must be EIP-55 checksummed and non-zero.** Lowercase or wrongly-cased input is rejected, not normalized, so two authors can't disagree silently.
- **Proxies.** The positionId is the proxy address. An implementation upgrade doesn't change the marketId. A malicious upgrade is an exploit of that contract, so the term sheet covers it.
- **The same address on two chains.** For example, sUSDe is `0x211Cc4DD…5E5fE5d2` on both Mantle and Plasma, so holding sUSDe on either chain gives the same marketId. That's fine, because the contract keeps them apart through its separate `chainId` field. The only real collision would be one cross-chain stack that contains the same address on two chains. No legacy market does, and the case is accepted as theoretical.
- **Implied positions are never listed.** A vault's `asset()`, a token's backing (sUSDe → USDe) and an aToken's underlying are implied by the position that holds them. Their risk goes in the term sheet. Listing them would give two authors two ways to write the same cover.

### 2.3 Aave v3 and its forks (Spark, and the Mantle and Plasma deployments)

Aave has one Pool per deployment and no id per market. Every reserve has its own aToken and variable-debt token, though, and each token address already implies the Pool, the deployment and the underlying asset.

- **Supplying asset X** adds the leaf `evm_address(aToken(X))`.
- **Borrowing asset Y** adds the leaf `evm_address(variableDebtToken(Y))`. Debt tokens can't be transferred, so holding one means you are borrowing.
- **One Aave account is one health factor.** A position with wstETH and rsETH as collateral, borrowing WETH, is the three leaves {aWstETH, aRsETH, vdWETH}. `aave_v3_position.v1` only handled one collateral and one debt. This rule handles any number of each and needs no special kind.
- **What isn't captured**, all accepted as theoretical:
  - **The collateral toggle:** an aToken held with its collateral switch off gives the same leaf as one used as collateral.
  - **E-mode and isolation mode:** they change LTV and liquidation thresholds only, and liquidation is not covered.
- **Stable-rate debt tokens** are deprecated and not used.
- **Forks use the same rule.** Spark's spTokens are just different addresses. Keeping forks apart for concentration caps is the job of the `protocol` bucket, not of the marketId.

### 2.4 Morpho Blue

- **Morpho's own id pins the market.** `morphoMarketId = keccak256(abi.encode(loanToken, collateralToken, oracle, irm, lltv))`, and none of those can ever change for a market. So the positionId pins the collateral, the oracle and the interest-rate model with no extra params.
- **Supplier and borrower are different kinds.** Otherwise one id would cover two positions whose losses run in opposite directions: bad debt hurts the supplier, and a loan-asset depeg helps the borrower. On PRIME/PYUSD, supplying gives `0xced79d0a…4aa91a` and borrowing (row 0) gives `0xc11577cf…a68547`.
- **A vault that both lends and borrows in the same market** contributes two leaves.
- **Collateral posted without borrowing** has no kind. It earns nothing, so nobody holds it. If it's ever needed, it becomes a new `morpho_blue_collateral.v1`.
- **The raw `morphoMarketId` is never a positionId on its own**, because it's shared by both sides.

### 2.5 `stellar_contract`

- **The positionId is the strkey's 32-byte contract id.** The `C…` strkey is base32-decoded, and its version byte and 2-byte checksum are dropped. The conversion can be reversed.
- **Stellar asset contracts are deterministic.** A classic Stellar asset such as USDC has one derived contract id. So "USDC the classic asset" and "USDC the SAC" can't be written two ways.
- **Stellar's 32-byte ids and padded EVM addresses share one id space.** A collision would need a contract id that starts with 12 zero bytes, so it can be ignored.

### 2.6 `twyne_position.v1` (draft, blocked)

Twyne deploys one collateral vault per user, so an address can't serve as the positionId. Doing so would give every buyer their own marketId. The position is the whitelisted class instead:

```
twyne_position.v1 → keccak256(abi.encode(TAG, intermediateVault, targetVault, targetAsset))
```

This follows OPEN_QUESTIONS §1, and the on-chain checks listed there still have to happen first. The same principle applies to every protocol that deploys a contract per user or issues position NFTs: **the kind names the class of position, and the specific instance (the account, NFT id or tick range) belongs in the policy.**

### 2.7 Kinds expected later (not needed yet)

| Kind | Params | Why a derived kind |
|---|---|---|
| `uniswap_v4_lp.v1` | `poolId` | all pools live in one PoolManager singleton. Tick ranges stay out, per the rule in §2.6 |
| `compound_v3_borrow.v1` | `comet`, `collateralAsset` | Comet collateral isn't tokenized. Supplying the base asset is just `evm_address(comet)` |
| `morpho_blue_collateral.v1` | `morphoMarketId` | only if collateral posted without borrowing is ever covered |

Uniswap v3 pools, Pendle markets and PTs, Euler EVK vaults, ERC-4626 vaults and Morpho Vaults v2 are all `evm_address`.

### 2.8 Rules for every kind

1. Params must be immutable and must fully identify the position. Mutable configuration (caps, allowlists, LTVs) never goes into a kind.
2. No param may be derivable from another. For example, an aToken already implies its pool.
3. Input must already be canonical. Anything else is rejected, never fixed up.
4. Every kind has test vectors. Once any market uses a kind, it is frozen, and a change becomes `.v<n+1>`.
5. Each kind can only be used on one chain family (EVM or Stellar). CI checks this against the registry entry's `chainId`.

## 3. marketId

```
leaves   = sort(unique(positionId(p) for p in positions))
marketId = keccak256(abi.encode(keccak256("firelight.market.v1"), keccak256(concat(leaves))))
```

The tag is `keccak256("firelight.market.v1") = 0xc0750894d7ba30b07c7555fcbc1e48a24b113b2e0959a0a4d44f55abe6605a55`.

- **Only the set is hashed.** The tree structure (which vault feeds which) and each position's role are not. The order positions are listed in doesn't matter.
- **Duplicates are removed.** A Morpho market reached through two MetaMorpho vaults counts once.
- **There is no chainId and no separate root.** The entry vault is just a member of the set, and the contract carries `chainId` separately.
- **Single-position markets use the same rule.** Holding syrupUSDC gives `marketId({syrupUSDC})`, not the padded address. That keeps one rule with no exceptions.
- **The Solidity equivalent**, in case one is ever needed: `keccak256(abi.encode(MARKET_TAG, keccak256(abi.encodePacked(sortedLeaves))))`.

### 3.1 Which positions a vault includes

A position that allocates funds to other positions (a vault) includes every position where its assets can sit at the moment the market is declared. Anything that doesn't allocate further is a leaf.

| Vault | Its positions |
|---|---|
| MetaMorpho v1 | Every Morpho market with cap > 0, or still in the withdraw queue (a market with cap 0 can still hold funds until it's removed) |
| Morpho Vaults v2 | Every adapter address, plus the markets or vaults each adapter can reach |
| BoringVault (Veda) | The positions its manageRoot's leaves can put funds into. Call targets that never hold funds, such as DEX aggregators and routers, are not positions. The leaf list must be checked against the on-chain manageRoot when the market is declared |
| Upshift, Mellow, others | The same principle, with a written rule per vault type before its first market |

Allocation sizes are never included. Raising a cap from 1% to 90% on a market that's already allowed keeps the marketId. Adding or removing a market changes it.

### 3.2 What's given up

These cases give two different covers the same marketId. Each is accepted as theoretical:

- **The same positions with different perils or thresholds, sold at the same time.** If this ever becomes real, `firelight.market.v2` can add a variant field, and existing ids stay valid.
- **The same positions wired differently**, for example two vaults that each allocate directly vs one vault feeding the other.
- **The collateral toggle and e-mode on Aave** (§2.3).
- **The same address appearing on two chains inside one stack** (§2.2).

### 3.3 Drift

The marketId is computed from the positions at declaration. If a vault's positions change later, new sales need a new declaration, which gives a new marketId. What happens to live covers is a term-sheet question (see §8).

## 4. Interface

```ts
type Hex = `0x${string}`;

/** One protocol position, such as a vault, a token hold or a Morpho supply. */
interface Position {
  kind: string;                    // "evm_address" | "morpho_blue_supply.v1" | …
  params: Record<string, string>;  // kind-specific, validated by the kind
}

/** A protocol plugin. Frozen once any market uses it. */
interface Kind {
  readonly name: string;
  readonly family: "evm" | "stellar";
  readonly params: readonly string[];
  positionId(params: Record<string, string>): Hex;   // validates, returns bytes32; throws on bad input
}

function positionId(p: Position): Hex;
function marketId(positions: Position[]): Hex;       // throws on an empty set, an unknown kind or bad params
function flatten(tree: PositionTree): Position[];    // registry tree to flat list
```

```ts
const MARKET_TAG = keccak256(stringToBytes("firelight.market.v1"));

export function marketId(positions: Position[]): Hex {
  if (positions.length === 0) throw new Error("a market needs at least one position");
  const leaves = [...new Set(positions.map(positionId))].sort();
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [MARKET_TAG, keccak256(concat(leaves))]));
}
```

`marketId` takes a flat list on purpose. Only the set is hashed, so a tree parameter would suggest the structure matters. The tree is kept in the registry for people to read and for claims.

Adding a protocol means adding one `Kind` with test vectors. `marketId()` doesn't change.

## 5. Registry

Each market in `markets.json` stores its positions as a tree. CI flattens the tree and computes the marketId. As now, the marketId itself is not stored.

```json
{
  "chainId": "1",
  "protocol": "morpho_vault",
  "name": "Example BoringVault, conservative strategy",
  "positions": {
    "kind": "evm_address", "params": { "address": "0x…BoringVault" },
    "children": [
      { "kind": "evm_address", "params": { "address": "0x…MetaMorphoA" },
        "children": [
          { "kind": "morpho_blue_supply.v1", "params": { "morphoMarketId": "0x…" } }
        ] }
    ]
  }
}
```

CI checks:

- `(chainId, marketId)` is unique.
- Every kind is known and matches the chain family.
- Params are canonical.
- Only allocating positions have children.
- Every kind's test vectors pass.

## 6. Legacy migration

These are the marketIds under this proposal for every legacy row that is fully specified by the legacy file.

| Row | Market | Leaves | marketId |
|---|---|---|---|
| 0 | PRIME/PYUSD Morpho loop | borrow(0x41c4…) | `0xc11577cf6aafca2ca3749757145adf3d41892ce27810147e5fdafcfc24a68547` |
| 1 | Aave Core wstETH → USDT | aWstETH, vdUSDT | `0xa777369e19bbbc775ba9d9a3bf3264d7766899bc4f4a20a87df9888a71e5b53d` |
| 2 | Aave Core wstETH → WETH | aWstETH, vdWETH | `0x88b4150dfbb64a818ea03eef980301c29bee536255240b5581055d15e514d9e5` |
| 3 | Aave Core rsETH → WETH | aRsETH, vdWETH | `0x67b1c9be3b339c080329f74e345ff31eaac01aebf3a0c1f164ffc3ef6db8a495` |
| 4 | wstETH/WETH Morpho loop | borrow(0xb8fc…) | `0x8ff4120802e493aabb507dfbb2dec2d54175a61676ce10cfe656de01b01186f0` |
| 5 | Spark wstETH → WETH | spWstETH, Spark vdWETH | `0xa34cd9546de03c23d19ab1ce5b9dda263f9beadcac0b054dd44b5d201d3f55e3` |
| 6 | Spark wstETH → USDT | spWstETH, Spark vdUSDT | `0x74a3907e400ae7702ae7e47d9ca008016a16b36b71b453070a7fffed8ee59551` |
| 7 | Aave Mantle sUSDe → USDT0 | aSUSDe, vdUSDT0 | `0x02af95ebffca66ee953bf080f97cd87047d4a17897b16e52c82b259882d3a85e` |
| 8 | Aave Plasma sUSDe → USDT0 | aSUSDe, vdUSDT0 | `0xbe7c230070ba236066e286f26973995e8a349201091278a2c471ef9694b47254` |
| 9 | Aave Plasma syrupUSDT → USDT0 | aSyrupUSDT, vdUSDT0 | `0xabd062b643449e35baab597cc9aecb8f299edcf34ad768e6db381445f7ef7ed8` |
| 10 | Hold syrupUSDC | syrupUSDC | `0x97b9d72cf48eab94597dfa490cb88949a57ffc20163b09a8e4f2f75edf43f821` |
| 11 | Hold syrupUSDT | syrupUSDT | `0x483ea6f0d5e31efc979bab8d0cdc56afca2f1eb4b9e450b48a5a352a307a312f` |
| 13 | Spark USDC supply | spUSDC | `0x1fc097f101fb192f2a333c762160f2302448136b99d507e269112bc3eea09b5b` |
| 19 | PST/PYUSD Morpho loop | borrow(0xb497…) | `0xc32052327a23ff0936cd3963e2f02228569ac136dd9ae66977e6e23341306d85` |
| 20 | sUSDe/PYUSD Morpho loop | borrow(0x90ef…) | `0x65c2eb86c6a497916bc70378ad7c048e370b7c1c2820b411ed7de49afe7d12ef` |
| 22 | syrupUSDC/PYUSD Morpho loop | borrow(0xc962…) | `0xa46a0eaaf16cd7f75edf52ba6ba7c467746a58b4356ad58dddcaf4286156d9ad` |

Rows that need more data first:

- **Rows 12, 15, 17, 18** (PayPal USD Main, Huma PST Main, PRIME Main, mWIN Main): these are MetaMorpho vaults. Their markets must be read from chain under §3.1.
- **Row 23** (Stellar USDC vault): its allocations are unknown.
- **Row 14** (Twyne): blocked on §2.6.
- **Rows 16, 21, 24** are exact duplicates of rows 0, 12 and 23, so they give the same marketIds. The uniqueness check in CI would reject them.

## 7. Alternatives considered

| Alternative | Why it was rejected |
|---|---|
| Entry contract as marketId (current SPECS) | A strategy change keeps the id, and one vault can't hold two covers |
| Risk team's hash of vault, strategy, assets and pool | The fields are inconsistent (sometimes arrays, sometimes values), and "strategy" labels the same position in different ways |
| Hash of a recursive tree | Not canonical: one Spark USDC supply could be written four ways |
| Hash of a flat set of (component, peril) pairs | A Morpho supplier and borrower collide, even though their losses run in opposite directions |
| Hash of a full canonical Scope document (nodes, edges, perils with typed params) | Correct, but too much machinery. It only separates covers that are never sold side by side, and perils belong in the signed terms |
| Stable id per vault, with scope committed separately | Contradicts both requirements in §1 |

## 8. Open questions

1. **Are any markets already registered on-chain under the current ids?** If yes, those ids need a transition plan. If no, this proposal can replace SPECS §5 directly.
2. **Protocol bucket for mixed markets.** A BoringVault spanning Morpho and Aave still gets one `protocol` bucket. Should the bucket follow the largest allocation, or the riskiest?
3. **Overlapping covers for one buyer.** The safe and risky covers on one BoringVault both contain the BoringVault itself. The term sheet has to say which cover pays if the BoringVault contract is exploited.
4. **Live covers after drift.** Should they continue pro-rata on the part still within the declared positions, or terminate with a refund?
5. **Children rules** for Upshift, Mellow and Morpho Vaults v2 need writing before those vaults' first markets.
6. **Twyne** (§2.6) and the vault reads for rows 12, 15, 17, 18 and 23 (§6).
