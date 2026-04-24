#![no_std]

mod errors;
mod invoice;

use soroban_sdk::{
    contract, contractimpl, symbol_short, token::Client as TokenClient, Address, Env, Vec,
};

use errors::ContractError;
use invoice::{
    get_invoice_funders, get_payer_score, invoice_exists, load_invoice, next_invoice_id,
    save_invoice, save_invoice_funders, set_payer_score, Invoice, InvoiceParams, InvoiceStatus,
    StorageKey,
};

// ----------------------------------------------------------------
// CONTRACT
// ----------------------------------------------------------------

#[contract]
pub struct InvoiceLiquidityContract;

#[contractimpl]
impl InvoiceLiquidityContract {
    // ------------------------------------------------------------
    // initialize (multi-token aware)
    // ------------------------------------------------------------
    pub fn initialize(
        env: Env,
        admin: Address,
        token: Address,
        xlm_token: Address,
    ) -> Result<(), ContractError> {
        if env.storage().instance().has(&StorageKey::InvoiceCount) {
            return Err(ContractError::Unauthorized);
        }

        env.storage().instance().set(&StorageKey::Admin, &admin);
        env.storage().instance().set(&StorageKey::FeeRate, &0_u32);
        env.storage()
            .instance()
            .set(&StorageKey::MaxDiscountRate, &5000_u32);

        // approve first token (USDC or default)
        env.storage()
            .persistent()
            .set(&StorageKey::ApprovedToken(token.clone()), &true);

        // approve native XLM SAC
        env.storage()
            .persistent()
            .set(&StorageKey::ApprovedToken(xlm_token.clone()), &true);

        let mut list: Vec<Address> = Vec::new(&env);
        list.push_back(token.clone());
        list.push_back(xlm_token.clone());

        env.storage()
            .persistent()
            .set(&StorageKey::TokenList, &list);

        Ok(())
    }

    // ------------------------------------------------------------
    pub fn set_admin(env: Env, new_admin: Address) {
        let admin: Address = env.storage().instance().get(&StorageKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&StorageKey::Admin, &new_admin);
    }

    pub fn update_fee_rate(env: Env, rate: u32) {
        let admin: Address = env.storage().instance().get(&StorageKey::Admin).unwrap();
        admin.require_auth();
        env.storage().instance().set(&StorageKey::FeeRate, &rate);
    }

    pub fn update_max_discount(env: Env, rate: u32) {
        let admin: Address = env.storage().instance().get(&StorageKey::Admin).unwrap();
        admin.require_auth();
        env.storage()
            .instance()
            .set(&StorageKey::MaxDiscountRate, &rate);
    }

    pub fn add_token(env: Env, token: Address) {
        let admin: Address = env.storage().instance().get(&StorageKey::Admin).unwrap();
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&StorageKey::ApprovedToken(token.clone()), &true);

        let mut list: Vec<Address> = env
            .storage()
            .persistent()
            .get(&StorageKey::TokenList)
            .unwrap_or(Vec::new(&env));
        if !list.contains(&token) {
            list.push_back(token);
            env.storage()
                .persistent()
                .set(&StorageKey::TokenList, &list);
        }
    }

    pub fn remove_token(env: Env, token: Address) {
        let admin: Address = env.storage().instance().get(&StorageKey::Admin).unwrap();
        admin.require_auth();
        env.storage()
            .persistent()
            .set(&StorageKey::ApprovedToken(token.clone()), &false);
    }

    // ------------------------------------------------------------
    // submit_invoice (NOW TOKEN-AWARE)
    // ------------------------------------------------------------
    pub fn submit_invoice(
        env: Env,
        freelancer: Address,
        payer: Address,
        amount: i128,
        due_date: u64,
        discount_rate: u32,
        token: Address,
    ) -> Result<u64, ContractError> {
        freelancer.require_auth();

        if amount <= 0 {
            return Err(ContractError::InvalidAmount);
        }

        let max_rate: u32 = env
            .storage()
            .instance()
            .get(&StorageKey::MaxDiscountRate)
            .unwrap_or(5000);
        if discount_rate == 0 || discount_rate > max_rate {
            return Err(ContractError::InvalidDiscountRate);
        }

        let now = env.ledger().timestamp();
        if due_date <= now {
            return Err(ContractError::InvalidDueDate);
        }

        // token validation
        if !is_approved_token(&env, &token) {
            return Err(ContractError::Unauthorized);
        }

        let id = next_invoice_id(&env);

        let invoice = Invoice {
            id,
            freelancer,
            payer,
            token,
            amount,
            due_date,
            discount_rate,
            status: InvoiceStatus::Pending,
            funder: None,
            funded_at: None,
            amount_funded: 0,
        };

        save_invoice(&env, &invoice);

        #[allow(deprecated)]
        env.events().publish((symbol_short!("submitted"),), id);

        Ok(id)
    }

    // ------------------------------------------------------------
    // submit_invoices_batch
    // ------------------------------------------------------------
    pub fn submit_invoices_batch(
        env: Env,
        invoices: Vec<InvoiceParams>,
    ) -> Result<Vec<u64>, ContractError> {
        if invoices.len() > 10 {
            return Err(ContractError::BatchTooLarge);
        }

        let mut authenticated_freelancers: Vec<Address> = Vec::new(&env);
        let mut ids = Vec::new(&env);
        for params in invoices.iter() {
            if !authenticated_freelancers.contains(&params.freelancer) {
                params.freelancer.require_auth();
                authenticated_freelancers.push_back(params.freelancer.clone());
            }

            if params.amount <= 0 {
                return Err(ContractError::InvalidAmount);
            }

            let max_rate: u32 = env
                .storage()
                .instance()
                .get(&StorageKey::MaxDiscountRate)
                .unwrap_or(5000);
            if params.discount_rate == 0 || params.discount_rate > max_rate {
                return Err(ContractError::InvalidDiscountRate);
            }

            let now = env.ledger().timestamp();
            if params.due_date <= now {
                return Err(ContractError::InvalidDueDate);
            }

            if !is_approved_token(&env, &params.token) {
                return Err(ContractError::Unauthorized);
            }

            let id = next_invoice_id(&env);

            let invoice = Invoice {
                id,
                freelancer: params.freelancer,
                payer: params.payer,
                token: params.token,
                amount: params.amount,
                due_date: params.due_date,
                discount_rate: params.discount_rate,
                status: InvoiceStatus::Pending,
                funder: None,
                funded_at: None,
                amount_funded: 0,
            };

            save_invoice(&env, &invoice);

            #[allow(deprecated)]
            env.events().publish((symbol_short!("submitted"),), id);

            ids.push_back(id);
        }

        Ok(ids)
    }

    // ------------------------------------------------------------
    // fund_invoice (USES invoice.token)
    // ------------------------------------------------------------
    pub fn fund_invoice(
        env: Env,
        funder: Address,
        invoice_id: u64,
        fund_amount: i128,
    ) -> Result<(), ContractError> {
        funder.require_auth();

        if !invoice_exists(&env, invoice_id) {
            return Err(ContractError::InvoiceNotFound);
        }

        let mut invoice = load_invoice(&env, invoice_id);

        match invoice.status {
            InvoiceStatus::Paid => return Err(ContractError::AlreadyPaid),
            InvoiceStatus::Defaulted => return Err(ContractError::InvoiceDefaulted),
            InvoiceStatus::Funded => return Err(ContractError::AlreadyFunded),
            InvoiceStatus::Pending | InvoiceStatus::PartiallyFunded => {} // all good
        }

        if invoice.amount_funded + fund_amount > invoice.amount {
            return Err(ContractError::OverfundingRejected);
        }

        // --- Execute transfer ---
        let token = token_client(&env, &invoice.token);
        let contract_address = env.current_contract_address();
        token.transfer(&funder, &contract_address, &fund_amount);

        // --- Update contributor list ---
        let mut funders = get_invoice_funders(&env, invoice_id);
        let mut found = false;
        for i in 0..funders.len() {
            let (addr, amt) = funders.get(i).unwrap();
            if addr == funder {
                funders.set(i, (addr, amt + fund_amount));
                found = true;
                break;
            }
        }
        if !found {
            funders.push_back((funder.clone(), fund_amount));
        }
        save_invoice_funders(&env, invoice_id, &funders);

        // --- Update invoice state ---
        invoice.amount_funded += fund_amount;

        if invoice.amount_funded == invoice.amount {
            // Fully funded — pay out to freelancer
            let discount_amount = invoice
                .amount
                .checked_mul(discount_rate_as_i128(invoice.discount_rate))
                .unwrap_or(0)
                / 10_000;
            let freelancer_payout = invoice.amount - discount_amount;

            token.transfer(&contract_address, &invoice.freelancer, &freelancer_payout);

            invoice.status = InvoiceStatus::Funded;
            invoice.funded_at = Some(env.ledger().timestamp());
            invoice.funder = Some(funder.clone()); // Legacy support for single funder if it was first
        } else {
            invoice.status = InvoiceStatus::PartiallyFunded;
        }

        save_invoice(&env, &invoice);

        #[allow(deprecated)]
        env.events()
            .publish((symbol_short!("funded"),), (invoice_id, funder));

        Ok(())
    }

    // ------------------------------------------------------------
    // transfer_invoice
    // ------------------------------------------------------------
    pub fn transfer_invoice(
        env: Env,
        invoice_id: u64,
        new_freelancer: Address,
    ) -> Result<(), ContractError> {
        if !invoice_exists(&env, invoice_id) {
            return Err(ContractError::InvoiceNotFound);
        }

        let mut invoice = load_invoice(&env, invoice_id);

        invoice.freelancer.require_auth();

        match invoice.status {
            InvoiceStatus::Pending => {}
            InvoiceStatus::PartiallyFunded | InvoiceStatus::Funded => {
                return Err(ContractError::AlreadyFunded)
            }
            InvoiceStatus::Paid => return Err(ContractError::AlreadyPaid),
            InvoiceStatus::Defaulted => return Err(ContractError::InvoiceDefaulted),
        }

        let old_freelancer = invoice.freelancer.clone();
        invoice.freelancer = new_freelancer.clone();

        save_invoice(&env, &invoice);

        env.events().publish(
            (soroban_sdk::Symbol::new(&env, "transferred"),),
            (invoice_id, old_freelancer, new_freelancer),
        );

        Ok(())
    }

    // ------------------------------------------------------------
    // mark_paid (USES invoice.token)
    // ------------------------------------------------------------
    pub fn mark_paid(env: Env, invoice_id: u64) -> Result<(), ContractError> {
        if !invoice_exists(&env, invoice_id) {
            return Err(ContractError::InvoiceNotFound);
        }

        let mut invoice = load_invoice(&env, invoice_id);

        invoice.payer.require_auth();

        match invoice.status {
            InvoiceStatus::Pending | InvoiceStatus::PartiallyFunded => {
                return Err(ContractError::NotFunded)
            }
            InvoiceStatus::Paid => return Err(ContractError::AlreadyPaid),
            InvoiceStatus::Defaulted => return Err(ContractError::InvoiceDefaulted),
            InvoiceStatus::Funded => {}
        }

        // Calculate total payout to all funders (principal + yield)
        let discount_amount = invoice
            .amount
            .checked_mul(discount_rate_as_i128(invoice.discount_rate))
            .unwrap_or(0)
            / 10_000;
        let total_to_distribute = invoice.amount + discount_amount;

        let token = token_client(&env, &invoice.token);
        let contract_address = env.current_contract_address();

        // Payer sends full invoice amount to the contract
        token.transfer(&invoice.payer, &contract_address, &invoice.amount);

        // Distribute proportionally
        let funders = get_invoice_funders(&env, invoice_id);
        for i in 0..funders.len() {
            let (funder_addr, contribution) = funders.get(i).unwrap();
            let share = (contribution * total_to_distribute) / invoice.amount;
            token.transfer(&contract_address, &funder_addr, &share);
        }

        invoice.status = InvoiceStatus::Paid;

        save_invoice(&env, &invoice);

        // --- Update payer reputation ---
        let current_score = get_payer_score(&env, &invoice.payer);
        set_payer_score(&env, &invoice.payer, current_score + 1);

        // Emit event
        #[allow(deprecated)]
        env.events().publish((symbol_short!("paid"),), invoice_id);

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
    pub fn claim_yield(env: Env, invoice_id: u64) -> Result<i128, ContractError> {
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
            InvoiceStatus::Pending | InvoiceStatus::PartiallyFunded | InvoiceStatus::Funded => {
                // Not settled yet — yield is pending, return 0
                Ok(0)
            }
            InvoiceStatus::Defaulted => Err(ContractError::InvoiceDefaulted),
            InvoiceStatus::Paid => {
                // Yield = the discount amount the LP earned
                let yield_amount = invoice
                    .amount
                    .checked_mul(discount_rate_as_i128(invoice.discount_rate))
                    .unwrap_or(0)
                    / 10_000;
                Ok(yield_amount)
            }
        }
    }

    // ----------------------------------------------------------------
    // claim_default
    //
    // Called by the LP if the invoice is not paid by the due date.
    // Reclaims the escrowed discount amount.
    // ----------------------------------------------------------------
    pub fn claim_default(env: Env, funder: Address, invoice_id: u64) -> Result<(), ContractError> {
        funder.require_auth();

        if !invoice_exists(&env, invoice_id) {
            return Err(ContractError::InvoiceNotFound);
        }

        let mut invoice = load_invoice(&env, invoice_id);

        // --- Validations ---

        // Only the original funder can claim
        if let Some(ref original_funder) = invoice.funder {
            if original_funder != &funder {
                return Err(ContractError::Unauthorized);
            }
        } else {
            return Err(ContractError::NotFunded);
        }

        // Can only be called after due_date has passed
        let now = env.ledger().timestamp();
        if now < invoice.due_date {
            return Err(ContractError::NotYetDefaulted);
        }

        // Invoice must be in Funded status
        match invoice.status {
            InvoiceStatus::Funded => {} // correct state
            InvoiceStatus::Pending | InvoiceStatus::PartiallyFunded => {
                return Err(ContractError::NotFunded)
            }
            InvoiceStatus::Paid => return Err(ContractError::AlreadyPaid),
            InvoiceStatus::Defaulted => return Err(ContractError::InvoiceDefaulted),
        }

        // --- Execution ---

        let token = token_client(&env, &invoice.token);
        let contract_address = env.current_contract_address();

        // Calculate the discount amount that was kept in escrow
        let discount_amount = invoice
            .amount
            .checked_mul(discount_rate_as_i128(invoice.discount_rate))
            .unwrap_or(0)
            / 10_000;

        // Transfer the escrowed discount back to the funder
        token.transfer(&contract_address, &funder, &discount_amount);

        // Update status to Defaulted
        invoice.status = InvoiceStatus::Defaulted;
        save_invoice(&env, &invoice);

        // Emit defaulted event
        // --- Update payer reputation ---
        let current_score = get_payer_score(&env, &invoice.payer);
        if current_score > 5 {
            set_payer_score(&env, &invoice.payer, current_score - 5);
        } else {
            set_payer_score(&env, &invoice.payer, 0);
        }

        // Emit event
        #[allow(deprecated)]
        env.events()
            .publish((symbol_short!("defaulted"),), invoice_id);

        Ok(())
    }

    // ----------------------------------------------------------------
    // payer_score
    // ----------------------------------------------------------------
    pub fn payer_score(env: Env, payer: Address) -> u32 {
        get_payer_score(&env, &payer)
    }

    // ----------------------------------------------------------------
    // suggested_discount_rate
    //
    // Returns a suggested discount rate in basis points based on
    // payer's reputation score.
    // Higher score = lower risk = lower discount rate.
    // ----------------------------------------------------------------
    pub fn suggested_discount_rate(env: Env, payer: Address) -> u32 {
        let score = get_payer_score(&env, &payer);
        // Formula: 500 + (100 - score) * 5
        // Score 100 -> 500 bps (5.0%)
        // Score 50  -> 750 bps (7.5%)
        // Score 0   -> 1000 bps (10.0%)
        500 + (100 - score) * 5
    }

    // ----------------------------------------------------------------
    // get_invoice — read-only helper for frontends and tests
    // ----------------------------------------------------------------
    pub fn get_invoice(env: Env, invoice_id: u64) -> Result<Invoice, ContractError> {
        if !invoice_exists(&env, invoice_id) {
            return Err(ContractError::InvoiceNotFound);
        }
        Ok(load_invoice(&env, invoice_id))
    }

    pub fn get_invoice_count(env: Env) -> u64 {
        env.storage()
            .persistent()
            .get(&StorageKey::InvoiceCount)
            .unwrap_or(0)
    }
}

// ----------------------------------------------------------------
// TOKEN HELPERS
// ----------------------------------------------------------------

fn token_client<'a>(env: &'a Env, token: &Address) -> TokenClient<'a> {
    TokenClient::new(env, token)
}

fn discount_rate_as_i128(rate: u32) -> i128 {
    rate as i128
}

fn is_approved_token(env: &Env, token: &Address) -> bool {
    env.storage()
        .persistent()
        .get(&StorageKey::ApprovedToken(token.clone()))
        .unwrap_or(false)
}

// ----------------------------------------------------------------
// TEST MODULES
// ----------------------------------------------------------------

mod test;
mod tests_multi_token;
mod tests_security;
mod tests_protocol_fee;
