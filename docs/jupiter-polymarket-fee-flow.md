# Jupiter x Polymarket Fee Flow

Checked on: 2026-03-11

Scope: This document covers the current fee flow for this app's Jupiter Prediction integration when the underlying venue is Polymarket, with all fee items written in their native units and currencies.

## Short answer

For the current app path, your own platform fee is effectively:

- `0%`
- `0 USDC`
- `0 micro-USD`
- no integrator / referral / success-fee parameter is sent by the app

The user can still pay these other costs:

1. Jupiter protocol fee
   - unit surfaced by Jupiter API: `micro-USD` string
   - display unit: `USD` / `USDC-equivalent`
   - field: `estimatedProtocolFeeUsd`
2. Venue fee from the underlying market venue
   - unit surfaced by Jupiter API: `micro-USD` string
   - display unit: `USD` / `USDC-equivalent`
   - field: `estimatedVenueFeeUsd`
   - if the venue is Polymarket, this is where Polymarket-side trading fees show up when applicable
3. Solana network fee
   - unit: `lamports`
   - chain token: `SOL`
   - base fee reference: `5000 lamports = 0.000005 SOL` per signature
4. Possible account-creation rent / ATA-style costs
   - unit: `lamports`
   - chain token: `SOL`
   - refundable when the related account is closed, if the account type supports closure
5. Possible fiat onramp / funding-provider fees
   - unit depends on provider
   - not part of the trade fee itself

## What is actually wired in this repo

These repo facts are checked from code:

1. The app sends Jupiter Prediction orders to `POST /prediction/v1/orders`.
2. Buy orders explicitly set `depositMint` to Solana USDC mint `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.
3. No custom platform fee, integrator fee, builder attribution, or sponsor flag is added in the current trade path.
4. The app signs and sends Jupiter's unsigned Solana transaction with the user's Privy wallet.
5. The app currently models only `estimatedTotalFeeUsd` in TypeScript, even though Jupiter's official response includes the split fields `estimatedProtocolFeeUsd` and `estimatedVenueFeeUsd`.

Checked code paths:

- `lib/services/jupiterTrade.ts`
- `hooks/useTrade.ts`
- `hooks/useAuth.ts`
- `lib/types/jupiter.types.ts`
- `components/market/TradePanel.tsx`

## Fee table by item

| Fee item | Applies now? | Native unit / currency | Who receives it | Current state in this app | Notes |
| --- | --- | --- | --- | --- | --- |
| Your platform fee | No | `0%`, `0 USDC`, `0 micro-USD` | Your app | `0` | No fee parameter is injected anywhere in the Jupiter order request. |
| Jupiter protocol fee | Yes, on executed buy/sell trades | `micro-USD` string from API, display as `USD` / `USDC-equivalent` | Jupiter prediction stack | Variable | Exact amount is returned per order quote as `estimatedProtocolFeeUsd`. Jupiter does not publish a single flat percentage for Prediction API trades. |
| Polymarket venue fee | Sometimes | Native Polymarket docs use `bps`, `USDC`, and in some cases share/output-asset terms; Jupiter surfaces it as `micro-USD` via `estimatedVenueFeeUsd` | Polymarket venue | Usually `0` on most markets, non-zero on fee-enabled markets | For your app, the authoritative pre-trade number is Jupiter's `estimatedVenueFeeUsd`, not a hardcoded Polymarket formula. |
| Solana base transaction fee | Yes, user tx only | `lamports`, paid in `SOL` | Solana validators | User-paid | Official Solana base fee is `5000 lamports` per signature. |
| Solana prioritization fee | Maybe | `micro-lamports` per compute unit internally, total paid in `lamports` / `SOL` | Solana validators | Unknown per tx | Only applies if the generated transaction includes a compute-budget price. Jupiter Prediction docs do not publish a fixed number. |
| ATA / token-account rent | Maybe | `lamports`, paid in `SOL` | Locked as rent-exempt balance on the new account | User-paid if the tx creates the account | For a standard 165-byte token account, Solana docs show `2039280 lamports = 0.00203928 SOL`. This is a rent-exempt deposit, not a trading fee. |
| Prediction-program account rent | Maybe | `lamports`, paid in `SOL` | Locked on created program accounts | User-paid if the tx creates them | Jupiter Prediction uses position/order/vault accounts. Public docs do not publish a fixed lamport amount for each created account. |
| Claim / payout fee | No trading fee | `0%`, `0 USDC`, `0 micro-USD` for the trading fee itself | None | Zero on the fee side | Claim still needs a Solana transaction, so the user can still pay network fee in `SOL`. |
| Success fee / intermediary performance fee | No, not in current path | `0%`, `0 USDC`, `0 micro-USD` in current app path | None in current path | Not configured | Separate direct-Polymarket builder programs can earn fee share, but this repo is not using that route. |
| Funding / onramp fee | Maybe, outside trading flow | provider-defined | Onramp / exchange | External | Example: Coinbase / MoonPay style fees are outside the Jupiter trade fee. |

## Units and how to render them

### 1. Jupiter Prediction API units

For this integration, these values should be treated as `micro-USD` strings:

- `orderCostUsd`
- `estimatedProtocolFeeUsd`
- `estimatedVenueFeeUsd`
- `estimatedTotalFeeUsd`
- `feesPaidUsd`
- `claimedUsd`
- `payoutUsd`
- `payoutAmountUsd`

Conversion:

- `1 USD = 1,000,000 micro-USD`
- display formula: `displayUsd = microUsd / 1_000_000`
- because the app buys with Solana USDC, `USD` and `USDC-equivalent` are effectively the same display unit here

Example:

- `estimatedTotalFeeUsd = "1320000"` -> `1.32 USD` -> about `1.32 USDC`

### 2. Polymarket native fee units

Polymarket documents multiple fee representations depending on which layer you look at:

1. Per-market fee switch
   - `fee_rate_bps`
   - unit: `bps`
   - `0 bps` means fee-free for that market
2. Technical fee model on fee-enabled markets
   - fee formulas are expressed in `USDC` and share/output-asset terms
   - buy-side and sell-side formulas are not represented as one flat percent
3. Builder / rebate programs
   - rebate payouts are documented in `USDC`

Important reconciliation:

- In direct Polymarket CLOB integrations, you may need to handle `fee_rate_bps` and the venue fee curve yourself.
- In this app, Jupiter already normalizes the venue cost into `estimatedVenueFeeUsd` in `micro-USD`.
- So for user-facing fee display in this app, the safest source of truth is Jupiter's quoted venue fee.

### 3. Solana fee units

Solana execution-related costs must be rendered in chain-native units:

- `1 SOL = 1,000,000,000 lamports`
- base tx fee reference: `5000 lamports = 0.000005 SOL` per signature
- standard token-account rent reference from official docs example:
  - `2039280 lamports = 0.00203928 SOL`

If you want a live USDC estimate beside the SOL number, compute it at runtime:

- `usdcEquivalent = solAmount * currentSolUsd`

I am not hardcoding a live SOL/USDC value in this document because the exact spot price is time-sensitive, while the units above are stable.

## Buy / Sell / Claim fee flow

### A. Buy flow

1. User enters an amount in `USDC`.
2. App sends a Jupiter order request with:
   - `isBuy: true`
   - `depositAmount` in `micro-USD`
   - `depositMint = USDC`
3. Jupiter returns:
   - unsigned transaction
   - `orderCostUsd`
   - `estimatedProtocolFeeUsd`
   - `estimatedVenueFeeUsd`
   - `estimatedTotalFeeUsd`
4. User signs and sends the Solana tx through Privy.
5. User pays:
   - principal in `USDC`
   - Jupiter protocol fee in `micro-USD` / `USD`
   - venue fee in `micro-USD` / `USD` when applicable
   - Solana network fee in `lamports` / `SOL`
   - possible new-account rent in `lamports` / `SOL`

### B. Sell flow

1. User sells contracts.
2. App sends a Jupiter order request with:
   - `isBuy: false`
   - `contracts`
   - optional `positionPubkey`
3. Jupiter again returns:
   - unsigned transaction
   - fee split in `micro-USD`
4. User pays:
   - Jupiter protocol fee in `micro-USD` / `USD`
   - venue fee in `micro-USD` / `USD` when applicable
   - Solana network fee in `lamports` / `SOL`
5. Net proceeds are therefore after:
   - venue + protocol trading fees
   - chain transaction cost

### C. Claim flow

1. User claims a winning position through Jupiter `POST /positions/{positionPubkey}/claim`.
2. Jupiter docs say there is no trading fee for payout claims.
3. User still signs a Solana transaction.
4. User therefore pays:
   - trading fee: `0`
   - venue fee: `0`
   - Jupiter fee: `0`
   - Solana network fee: yes, in `lamports` / `SOL`

## Jupiter fees: what is fixed vs what is variable

What is fixed from docs:

- fees are only charged on executed buy/sell trades
- no fees on payout claims
- fees are charged in the mint used to purchase the contracts
- fees are rounded up to the nearest cent
- fee amount increases with:
  - trade size
  - uncertainty around `p = 0.50`

What is not published as one fixed universal number:

- a single flat `%` for Jupiter Prediction API
- a single flat `bps` for every market

What you should trust instead:

- pre-trade: `estimatedProtocolFeeUsd`, `estimatedVenueFeeUsd`, `estimatedTotalFeeUsd`
- post-trade: `feesPaidUsd` on the position

## Polymarket fees: current checked state

This is the part that requires the most care because Polymarket docs are split across user docs, builder docs, and technical CLOB docs.

### Current checked interpretation

1. Most Polymarket markets are fee-free.
2. Some markets are explicitly fee-enabled.
3. For fee-enabled markets, the authoritative market-level switch is `fee_rate_bps`.
4. Recent Polymarket docs say fee-enabled markets now include:
   - 15-minute crypto
   - 5-minute crypto
   - NCAAB
   - Serie A
5. Those taker fees fund maker rebates paid in `USDC`.

### Why this matters for your app

If Jupiter routes to a Polymarket market that is fee-free:

- expected `estimatedVenueFeeUsd` should be `0` or effectively `0`

If Jupiter routes to a Polymarket market that is fee-enabled:

- `estimatedVenueFeeUsd` can be non-zero
- the exact venue fee is market-specific and probability-dependent
- do not hardcode a single Polymarket percentage

### Important note about doc drift

Polymarket's generic CLOB introduction still shows a `0 bps / 0 bps` schedule table, but newer Polymarket fee pages and changelog state that selected markets now have taker fees enabled. For current behavior, the newer specialized fee docs and the per-market `fee-rate` endpoint should be treated as more authoritative than the older generic overview table.

## Is there any success fee / hidden middleman fee?

For the current repo path: no.

Checked reasoning:

1. This app does not add its own fee parameter.
2. This app does not use a direct Polymarket builder attribution flow.
3. This app does not enable Privy transaction sponsorship in the current trade path.
4. The only documented trading charges in the current execution path are:
   - Jupiter protocol fee
   - underlying venue fee
   - Solana execution cost

Separate but not active in this repo:

- Direct Polymarket Builder Program:
  - can earn fee share on routed orders
  - can provide gasless relayer access for proxy wallets
  - not present in this app's Jupiter flow

## Gas and sponsorship: who pays today?

Current checked answer: the user pays gas today.

Why:

1. The app signs Jupiter's returned unsigned transaction with the user's Privy wallet.
2. The current code path does not set `sponsor: true`.
3. Privy's sponsorship docs show sponsorship as an explicit opt-in path, not the default send behavior.

Therefore, in the current repo:

- gas payer assumption: user wallet
- gas unit: `lamports` / `SOL`
- sponsorship fee to user: none, because sponsorship is not enabled

## ATA and account-creation costs

This needs precision:

1. A standard SPL token account has a rent-exempt SOL deposit requirement.
2. An official Solana RPC example shows a token account with `2039280 lamports`, which equals `0.00203928 SOL`.
3. That amount is a rent-exempt deposit, not a trading fee.
4. Jupiter Prediction also uses program accounts such as:
   - position account
   - order account
   - vault account
5. Public Jupiter docs do not publish a single fixed lamport total for all those possible created accounts.

So the safe statement is:

- standard token-account / ATA-style cost reference:
  - `2039280 lamports = 0.00203928 SOL`
- exact total account-creation burden for a given Jupiter prediction transaction:
  - must be read from the actual built transaction or a simulation
  - cannot be guaranteed from docs alone

## What is missing in the current UI / types

Two implementation gaps matter if you want fee transparency in-product:

1. The current `JupiterCreateOrderResponse` type only includes `estimatedTotalFeeUsd`.
   - official Jupiter API also exposes:
     - `estimatedProtocolFeeUsd`
     - `estimatedVenueFeeUsd`
2. The current trade panel does not display the fee breakdown before swipe / submit.

That means:

- the app can trade correctly today
- but it cannot yet show a fully itemized fee receipt to the user without extending the local type and UI

## Most precise source of truth for production

If you want the most exact fee receipt possible per trade, the correct priority order is:

1. Jupiter order quote response
   - `estimatedProtocolFeeUsd`
   - `estimatedVenueFeeUsd`
   - `estimatedTotalFeeUsd`
2. Confirmed position data after execution
   - `feesPaidUsd`
3. Solana transaction metadata
   - actual network fee in `lamports`
4. Optional venue-specific cross-check for Polymarket
   - `fee_rate_bps` on the market's token id

## Checked sources

Official Jupiter:

- [Prediction docs](https://dev.jup.ag/docs/prediction)
- [Prediction overview](https://dev.jup.ag/docs/prediction/index)
- [Create Order API](https://dev.jup.ag/api-reference/prediction/create-order)
- [Claim Position API](https://dev.jup.ag/api-reference/prediction/claim-position)
- [Get Position API](https://dev.jup.ag/api-reference/prediction/get-position)

Official Polymarket:

- [Trading Fees](https://docs.polymarket.com/polymarket-learn/trading/fees)
- [CLOB Introduction](https://docs.polymarket.com/developers/CLOB/introduction)
- [Builder Program Introduction](https://docs.polymarket.com/developers/builders/builder-intro)
- [Maker Rebates Program technical guide](https://docs.polymarket.com/developers/market-makers/maker-rebates-program)
- [Maker Rebates Program overview](https://docs.polymarket.com/polymarket-learn/trading/maker-rebates-program)
- [Polymarket changelog](https://docs.polymarket.com/changelog/changelog)

Official Solana:

- [Transaction Fees](https://solana.com/docs/core/fees)
- [Create Token Account](https://solana.com/docs/tokens/basics/create-token-account)
- [Close Token Account](https://solana.com/docs/tokens/basics/close-account)
- [getTokenAccountsByOwner RPC example](https://solana.com/docs/rpc/http/gettokenaccountsbyowner)

Official Privy:

- [Sign and send a transaction](https://docs.privy.io/wallets/using-wallets/solana/sign-a-transaction)
- [UseSendTransaction and sponsorship](https://docs.privy.io/recipes/react/transactions/smart-wallets)

Repo-local evidence:

- `lib/services/jupiterTrade.ts`
- `hooks/useTrade.ts`
- `hooks/useAuth.ts`
- `lib/types/jupiter.types.ts`
- `components/market/TradePanel.tsx`
