#![no_std]

mod errors;
mod invoice;

use soroban_sdk::{
    contract, contractimpl,
    token::Client as TokenClient,
    Address, Env,
};

use errors::ContractError;
use invoice::{
    invoice_exists, load_invoice, next_invoice_id, save_invoice,
    Invoice, InvoiceStatus, StorageKey,
};

#[contract]
pub struct InvoiceLiquidityContract;

#[contractimpl]
impl InvoiceLiquidityContract {

    // ----------------------------------------------------------------
    // initialize
    //
    // Called once by the deployer to set the USDC token address.
    // ----------------------------------------------------------------
    pub fn initialize(env: Env, token: Address) -> Result<(), ContractError> {
        if env.storage().instance().has(&StorageKey::Token) {
            return Err(ContractError::Unauthorized); // already initialized
        }
        env.storage().instance().set(&StorageKey::Token, &token);
        Ok(())
    }

    // ----------------------------------------------------------------
    // submit_invoice
    //
    // Called by a freelancer to register an unpaid invoice.
    // No funds move at this stage — the invoice sits as Pending
    // until a liquidity provider funds it.
    //
    // Returns the new invoice ID.
    // ----------------------------------------------------------------
    pub fn submit_invoice(
        env:           Env,
        freelancer:    Address,
        payer:         Address,
        amount:        i128,
        due_date:      u64,
        discount_rate: u32,   // basis points, max 5000 (= 50%)
    ) -> Result<u64, ContractError> {

        // Require the freelancer's signature — they must authorise submission
        freelancer.require_auth();

        // --- Validation ---

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        // Cap discount at 50% (5000 basis points) — anything higher is
        // predatory and almost certainly a mistake
        if discount_rate == 0 || discount_rate > 5_000 {
            return Err(ContractError::InvalidDiscountRate);
        }

        // due_date must be in the future
        let now = env.ledger().timestamp();
        if due_date <= now {
            return Err(ContractError::InvalidDueDate);
        }

        // --- Build and persist the invoice ---

        let id = next_invoice_id(&env);

        let invoice = Invoice {
            id,
            freelancer,
            payer,
            amount,
            due_date,
            discount_rate,
            status:     InvoiceStatus::Pending,
            funder:     None,
            funded_at:  None,
        };

        save_invoice(&env, &invoice);

        // Emit event so indexers and frontends can track submissions
        env.events().publish(
            (soroban_sdk::symbol_short!("submitted"),),
            id,
        );

        Ok(id)
    }

    // ----------------------------------------------------------------
    // fund_invoice
    //
    // Called by a liquidity provider to fund a Pending invoice.
    //
    // The LP sends the full invoice amount in USDC to this contract.
    // The contract immediately forwards (amount - discount) to the
    // freelancer, keeping the discount in escrow.
    //
    // When mark_paid is called, the full amount is released to the LP —
    // they earn the discount spread as yield.
    // ----------------------------------------------------------------
    pub fn fund_invoice(
        env:        Env,
        funder:     Address,
        invoice_id: u64,
    ) -> Result<(), ContractError> {

        funder.require_auth();

        if !invoice_exists(&env, invoice_id) {
            return Err(ContractError::InvoiceNotFound);
        }

        let mut invoice = load_invoice(&env, invoice_id);

        match invoice.status {
            InvoiceStatus::Funded    => return Err(ContractError::AlreadyFunded),
            InvoiceStatus::Paid      => return Err(ContractError::AlreadyPaid),
            InvoiceStatus::Defaulted => return Err(ContractError::InvoiceDefaulted),
            InvoiceStatus::Pending   => {} // all good, continue
        }

        // --- Calculate payout amounts ---
        //
        // discount_rate is in basis points (1/100 of a percent)
        // discount_amount = amount * discount_rate / 10_000
        // freelancer receives:  amount - discount_amount
        // LP gets back on paid: amount  (earns the discount as yield)

        let discount_amount = invoice.amount
            .checked_mul(discount_rate_as_i128(invoice.discount_rate))
            .unwrap_or(0)
            / 10_000;

        let freelancer_payout = invoice.amount - discount_amount;

        let token = usdc_client(&env);
        let contract_address = env.current_contract_address();

        // Step 1: LP sends full invoice amount to this contract
        token.transfer(&funder, &contract_address, &invoice.amount);

        // Step 2: Contract immediately pays out (amount - discount) to freelancer
        token.transfer(&contract_address, &invoice.freelancer, &freelancer_payout);

        // --- Update invoice state ---

        let now = env.ledger().timestamp();

        invoice.status    = InvoiceStatus::Funded;
        invoice.funder    = Some(funder.clone());
        invoice.funded_at = Some(now);

        save_invoice(&env, &invoice);

        env.events().publish(
            (soroban_sdk::symbol_short!("funded"),),
            invoice_id,
        );

        Ok(())
    }

    // ----------------------------------------------------------------
    // mark_paid
    //
    // Called by the payer to settle the invoice in full.
    //
    // The payer sends the full invoice amount to this contract.
    // The contract releases it to the LP — who now holds:
    //   - their original principal back
    //   - plus the discount they kept in escrow = their yield
    //
    // Only the registered payer can call this function.
    // ----------------------------------------------------------------
    pub fn mark_paid(
        env:        Env,
        invoice_id: u64,
    ) -> Result<(), ContractError> {

        if !invoice_exists(&env, invoice_id) {
            return Err(ContractError::InvoiceNotFound);
        }

        let mut invoice = load_invoice(&env, invoice_id);

        // Only the registered payer can mark it paid
        invoice.payer.require_auth();

        match invoice.status {
            InvoiceStatus::Pending   => return Err(ContractError::NotFunded),
            InvoiceStatus::Paid      => return Err(ContractError::AlreadyPaid),
            InvoiceStatus::Defaulted => return Err(ContractError::InvoiceDefaulted),
            InvoiceStatus::Funded    => {} // correct state, continue
        }

        let funder = invoice
            .funder
            .clone()
            .ok_or(ContractError::NotFunded)?;

        let token = usdc_client(&env);
        let contract_address = env.current_contract_address();

        // Payer sends full invoice amount to the contract
        token.transfer(&invoice.payer, &contract_address, &invoice.amount);

        // Calculate the discount amount that was kept in escrow
        let discount_amount = invoice.amount
            .checked_mul(discount_rate_as_i128(invoice.discount_rate))
            .unwrap_or(0)
            / 10_000;

        // Contract releases the full amount + the escrowed discount to the LP
        // LP receives: their escrowed discount + the payer's settlement
        // Total = invoice.amount + discount_amount
        token.transfer(&contract_address, &funder, &(invoice.amount + discount_amount));

        // --- Update invoice state ---

        invoice.status = InvoiceStatus::Paid;
        save_invoice(&env, &invoice);

        env.events().publish(
            (soroban_sdk::symbol_short!("paid"),),
            invoice_id,
        );

        Ok(())
    }

    // ----------------------------------------------------------------
    // claim_yield
    //
    // Called by the LP after mark_paid has been called.
    //
    // In this contract design the yield is paid out automatically
    // inside mark_paid — so claim_yield is a read function that
    // returns how much yield the LP earned on a specific invoice.
    //
    // Useful for frontends to display LP earnings history.
    // ----------------------------------------------------------------
    pub fn claim_yield(
        env:        Env,
        invoice_id: u64,
    ) -> Result<i128, ContractError> {

        if !invoice_exists(&env, invoice_id) {
            return Err(ContractError::InvoiceNotFound);
        }

        let invoice = load_invoice(&env, invoice_id);

        // Only the funder can query their own yield
        if let Some(ref funder) = invoice.funder {
            funder.require_auth();
        } else {
            return Err(ContractError::NothingToClaim);
        }

        match invoice.status {
            InvoiceStatus::Pending | InvoiceStatus::Funded => {
                // Not settled yet — yield is pending, return 0
                Ok(0)
            }
            InvoiceStatus::Defaulted => {
                Err(ContractError::InvoiceDefaulted)
            }
            InvoiceStatus::Paid => {
                // Yield = the discount amount the LP earned
                let yield_amount = invoice.amount
                    .checked_mul(discount_rate_as_i128(invoice.discount_rate))
                    .unwrap_or(0)
                    / 10_000;
                Ok(yield_amount)
            }
        }
    }

    // ----------------------------------------------------------------
    // get_invoice — read-only helper for frontends and tests
    // ----------------------------------------------------------------
    pub fn get_invoice(
        env:        Env,
        invoice_id: u64,
    ) -> Result<Invoice, ContractError> {
        if !invoice_exists(&env, invoice_id) {
            return Err(ContractError::InvoiceNotFound);
        }
        Ok(load_invoice(&env, invoice_id))
    }

    // ----------------------------------------------------------------
    // get_invoice_count — read-only helper for frontends
    // ----------------------------------------------------------------
    pub fn get_invoice_count(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&StorageKey::InvoiceCount)
            .unwrap_or(0)
    }
}

// ----------------------------------------------------------------
// Private helpers
// ----------------------------------------------------------------

fn usdc_client(env: &Env) -> TokenClient<'_> {
    let usdc_address: Address = env.storage()
        .instance()
        .get(&StorageKey::Token)
        .expect("contract not initialized");
    TokenClient::new(env, &usdc_address)
}

fn discount_rate_as_i128(rate: u32) -> i128 {
    rate as i128
}

mod test;