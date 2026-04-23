# Invoice Liquidity Network

**Turn unpaid invoices into instant liquidity on-chain, on Stellar.**

Invoice Liquidity Network (ILN) is an open-source, decentralized invoice factoring protocol built on [Stellar](https://stellar.org) using [Soroban](https://soroban.stellar.org) smart contracts. Freelancers, creators, and SMEs can unlock the value of their outstanding invoices immediately, while DeFi liquidity providers earn yield by funding them at a discount.

No banks. No credit checks. No 60-day waits.

---

## The Problem

Invoice payment delays are one of the most persistent cash flow problems for independent workers and small businesses globally:

- The average invoice payment delay is **30–90 days**
- Traditional invoice factoring companies charge **3–5% fees** and restrict access
- Most DeFi lending protocols require crypto collateral — useless for someone holding an invoice, not tokens

## The Solution

ILN creates a two-sided marketplace on Stellar:

|                 Role                  |               What they do                |                 What they get                |
|---------------------------------------|-------------------------------------------|----------------------------------------------|
| **Invoice holder** (freelancer / SME) | Submits an unpaid invoice to the protocol | Immediate USDC liquidity at a small discount |
| **Liquidity provider** (DeFi user)    | Funds invoices at a discount rate         | Yield when the invoice is paid in full       |

The Soroban contract acts as a trustless escrow holding funds, enforcing terms, and releasing payments automatically.

---

## How It Works

```
Freelancer                  ILN Contract              Liquidity Provider
    |                            |                            |
    |--- submit_invoice() ------>|                            |
    |    (amount, payer,         |                            |
    |     due_date, discount)    |                            |
    |                            |<--- fund_invoice() --------|
    |                            |    (sends USDC at          |
    |<-- receives USDC -------   |     discounted amount)     |
    |   (amount - discount)      |                            |
    |                            |                            |
   ...    invoice due date       ...                          |
    |                            |                            |
  Payer --- mark_paid() -------->|                            |
                                 |--- releases full amount -->|
                                      (LP earns the spread)
```

### Contract lifecycle

1. **Submit** — A freelancer calls `submit_invoice()` with the invoice details and a proposed discount rate
2. **Fund** — A liquidity provider calls `fund_invoice()`, sending USDC. The freelancer immediately receives `amount × (1 - discount_rate)`
3. **Pay** — The payer (client) calls `mark_paid()` or is verified off-chain, releasing the full invoice amount to the LP
4. **Earn** — The LP receives the full invoice value, earning the discount spread as yield

---

## Built on Stellar

ILN is built natively on Stellar for a reason:

- **Native USDC support** — Stellar has deep USDC liquidity via Circle, making it the ideal stablecoin rail for invoice settlements
- **Ultra-low fees** — Stellar transactions cost fractions of a cent, making micropayment invoices economically viable
- **Fast finality** — 3–5 second transaction finality means liquidity moves in near real-time
- **Soroban smart contracts** — Stellar's native smart contract platform provides the trustless escrow layer ILN needs
- **Financial inclusion focus** — Stellar's mission aligns with ILN's goal of giving underserved freelancers and SMEs access to capital

### Testnet Deployment

|      Network    |                       Contract ID                          |
|-----------------|------------------------------------------------------------|
| Stellar Testnet | `CD3TE3IAHM737P236XZL2OYU275ZKD6MN7YH7PYYAXYIGEH55OPEWYJC` |

> Mainnet deployment coming after audit. Do not use with real funds until then.

---

## Repository Structure

```
invoice-liquidity-network/
├── contracts/
│   └── invoice_liquidity/
│       ├── src/
│       │   ├── lib.rs          # Main contract entry point
│       │   ├── invoice.rs      # Invoice struct + storage
│       │   ├── errors.rs       # Contract error types
│       │   └── events.rs       # Contract events
│       └── Cargo.toml
├── tests/
│   ├── submit_invoice_test.rs
│   ├── fund_invoice_test.rs
│   └── mark_paid_test.rs
├── docs/
│   ├── architecture.md         # System design deep-dive
│   ├── risk-model.md           # Default handling + LP risk
│   └── integration-guide.md   # How to integrate ILN
├── scripts/
│   ├── deploy.sh               # Deploy to testnet/mainnet
│   └── invoke.sh               # Helper scripts for contract calls
├── CONTRIBUTING.md
├── LICENSE
└── README.md
```

---

## Smart Contract Interface

### Data Types

```rust
#[contracttype]
pub struct Invoice {
    pub id: u64,
    pub freelancer: Address,
    pub payer: Address,
    pub amount: i128,          // in stroops (1 USDC = 10_000_000 stroops)
    pub due_date: u64,         // Unix timestamp
    pub discount_rate: u32,    // basis points, e.g. 300 = 3%
    pub status: InvoiceStatus,
    pub funder: Option<Address>,
}

#[contracttype]
pub enum InvoiceStatus {
    Pending,    // submitted, awaiting funding
    Funded,     // LP has funded, freelancer paid out
    Paid,       // payer has settled, LP released
    Defaulted,  // past due_date, not paid
}
```

### Functions

```rust
// Submit a new invoice to the protocol
fn submit_invoice(
    env: Env,
    freelancer: Address,
    payer: Address,
    amount: i128,
    due_date: u64,
    discount_rate: u32,
) -> u64  // returns invoice_id

// Fund an invoice as a liquidity provider
fn fund_invoice(
    env: Env,
    funder: Address,
    invoice_id: u64,
) -> Result<(), ContractError>

// Mark an invoice as paid (called by payer or authorized oracle)
fn mark_paid(
    env: Env,
    invoice_id: u64,
) -> Result<(), ContractError>

// Get invoice details
fn get_invoice(env: Env, invoice_id: u64) -> Invoice

// Claim funds after default (LP recourse mechanism)
fn claim_default(
    env: Env,
    funder: Address,
    invoice_id: u64,
) -> Result<(), ContractError>
```

---


## Deployment Script
This repository includes an automated deployment script that handles the full Soroban contract lifecycle.

### Script Location
```bash
scripts/deploy.ts
```
### What it does
The script fully automates:
- Contract build using existing Makefile
- WASM artifact detection
- Deployment to Soroban testnet or mainnet
- Contract verification using get_invoice(1)
- Automatic update of:
  - .env → CONTRACT_ID
  - README.md → Contract ID field
- Dry-run mode for safe testing
- Structured error handling

### Usage
#### Deploy to Testnet
```bash
node scripts/deploy.ts --network=testnet
```

#### Deploy to Mainnet
```bash
node scripts/deploy.ts --network=mainnet
```
#### Dry Run (No Deployment)
```bash
node scripts/deploy.ts --dry-run
```

### Environment Setup
Ensure .env contains:
```env
STELLAR_SECRET_KEY=your_secret_key
```

## Getting Started

### Prerequisites

- [Rust](https://rustup.rs/) (1.74+)
- [Stellar CLI](https://developers.stellar.org/docs/tools/developer-tools/stellar-cli) (`stellar`)
- A funded Stellar testnet wallet

### Installation

```bash
# Clone the repository
git clone https://github.com/Nursca/Invoice-Liquidity-Network.git
cd invoice-liquidity-network

# Install Stellar CLI
cargo install --locked stellar-cli --features opt

# Configure for testnet
stellar network add testnet \
  --rpc-url https://soroban-testnet.stellar.org \
  --network-passphrase "Test SDF Network ; September 2015"

# Generate a testnet keypair and fund it
stellar keys generate --global alice --network testnet
stellar keys fund alice --network testnet
```

### Build & Test

```bash
# Build the contract
cd contracts/invoice_liquidity
cargo build --target wasm32-unknown-unknown --release

# Run tests
cargo test

# Deploy to testnet
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/invoice_liquidity.wasm \
  --source alice \
  --network testnet
```

### Invoke the Contract

```bash
# Submit an invoice
stellar contract invoke \
  --id $CONTRACT_ID \
  --source alice \
  --network testnet \
  -- submit_invoice \
  --freelancer GXXXXXXXXXX \
  --payer GXXXXXXXXXX \
  --amount 1000000000 \
  --due_date 1735689600 \
  --discount_rate 300

# Fund an invoice (as LP)
stellar contract invoke \
  --id $CONTRACT_ID \
  --source bob \
  --network testnet \
  -- fund_invoice \
  --funder GXXXXXXXXXX \
  --invoice_id 1
```

---

## Open Issues

Browse open issues and apply to work on them:

|                        Issue                          |                        Description                       |
|-------------------------------------------------------|----------------------------------------------------------|
| [#1 — Frontend invoice submission UI](../../issues/1) | Build a simple web UI for freelancers to submit invoices |
| [#2 — Payer verification oracle](../../issues/2)      | Design an off-chain oracle that verifies invoice payment |
| [#3 — Risk scoring model](../../issues/3)             | Propose a discount rate model based on payer reputation  |
| [#4 — Multi-token support](../../issues/4)            | Extend beyond USDC to other Stellar assets               |
| [#5 — SDK + npm package](../../issues/5)              | Write a JavaScript SDK wrapping the contract calls       |

See [CONTRIBUTING.md](./CONTRIBUTING.md) to contribute.

---

## Risk & Limitations

ILN is experimental software. Key risks to understand:

**Default risk** — If a payer doesn't pay, the LP absorbs the loss. ILN v1 does not have an insurance mechanism. This is being addressed in [Issue #3](../../issues/3).

**Oracle trust** — `mark_paid()` currently relies on the payer calling the contract directly, or a trusted oracle. A decentralized verification layer is on the roadmap.

**No credit scoring (yet)** — All invoices are treated equally. Discount rates are set by the freelancer. LPs should assess payer quality manually for now.

**Smart contract risk** — This contract has not been audited. Do not use on mainnet with real funds until a formal audit is completed.

---

## Roadmap

- [x] Core Soroban contract (submit, fund, mark_paid)
- [x] Testnet deployment
- [ ] Frontend dApp for freelancers
- [ ] LP dashboard with yield analytics
- [ ] Off-chain payer verification oracle
- [ ] Payer reputation / credit scoring
- [ ] Formal security audit
- [ ] Mainnet deployment
- [ ] Multi-asset support (beyond USDC)
- [ ] DAO governance for protocol parameters

---

## Contributing

We welcome contributions of all kinds — smart contract improvements, documentation, frontend, tests, and research.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full process.

---

## License

MIT — see [LICENSE](./LICENSE)

---

## Acknowledgements

Built on [Stellar](https://stellar.org) and [Soroban](https://soroban.stellar.org).

> This project is not affiliated with Stellar Development Foundation.

See [CONTRIBUTING.md](./CONTRIBUTING.md) to contribute.
---
