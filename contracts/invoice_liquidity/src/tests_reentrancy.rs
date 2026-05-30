#![cfg(test)]

//! Reentrancy guard tests for the InvoiceLiquidity contract.
//!
//! These tests verify that the reentrancy guard prevents reentrant calls to
//! protected functions. The guard uses a boolean flag in contract instance storage
//! that is set to `true` when entering a protected function and cleared when exiting.
//!
//! Tests cover:
//!   1. fund_invoice() is protected by the reentrancy guard
//!   2. mark_paid() is protected by the reentrancy guard
//!   3. Guard is properly cleared after successful execution
//!   4. Guard is properly cleared after error conditions

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token::{Client as TokenClient, StellarAssetClient},
    Address, Env,
};

// ================================================================
// Test Setup
// ================================================================

struct TestEnv {
    env: Env,
    contract: InvoiceLiquidityContractClient<'static>,
    token: TokenClient<'static>,
    freelancer: Address,
    payer: Address,
    funder: Address,
    lp_b: Address,
}

const INVOICE_AMOUNT: i128 = 1_000_000_000; // 100 USDC in stroops
const DISCOUNT_RATE: u32 = 300; // 3% discount
const DUE_DATE_OFFSET: u64 = 60 * 60 * 24 * 30; // 30 days

fn setup_reentrancy_test() -> TestEnv {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy mock USDC token
    let usdc_admin = Address::generate(&env);
    let usdc_contract_id = env.register_stellar_asset_contract_v2(usdc_admin.clone());
    let usdc_address = usdc_contract_id.address();

    let token = TokenClient::new(&env, &usdc_address);
    let token_admin = StellarAssetClient::new(&env, &usdc_address);

    // Generate test wallets
    let freelancer = Address::generate(&env);
    let payer = Address::generate(&env);
    let funder = Address::generate(&env);
    let lp_b = Address::generate(&env);

    // Mint enough tokens for all operations
    token_admin.mint(&funder, &(INVOICE_AMOUNT * 10));
    token_admin.mint(&lp_b, &(INVOICE_AMOUNT * 10));
    token_admin.mint(&payer, &(INVOICE_AMOUNT * 10));

    // Deploy and initialize the ILN contract
    let contract_id = env.register(InvoiceLiquidityContract, ());
    let contract = InvoiceLiquidityContractClient::new(&env, &contract_id);
    token_admin.mint(&contract.address, &(INVOICE_AMOUNT * 100));

    // Deploy XLM token
    let xlm_admin = Address::generate(&env);
    let xlm_contract_id = env.register_stellar_asset_contract_v2(xlm_admin);
    let xlm_address = xlm_contract_id.address();

    contract.initialize(&usdc_admin, &usdc_address, &xlm_address);

    // Fix ledger timestamp
    let mut ledger_info = env.ledger().get();
    ledger_info.timestamp = 1_700_000_000;
    env.ledger().set(ledger_info);

    TestEnv {
        env,
        contract,
        token,
        freelancer,
        payer,
        funder,
        lp_b,
    }
}

/// Helper: submit a standard invoice and return its ID
fn submit_standard_invoice(t: &TestEnv) -> u64 {
    let due_date = t.env.ledger().timestamp() + DUE_DATE_OFFSET;
    t.contract.submit_invoice(
        &t.freelancer,
        &t.payer,
        &INVOICE_AMOUNT,
        &due_date,
        &DISCOUNT_RATE,
        &t.token.address,
    )
}

/// Helper: get the current reentrancy lock state from storage
fn get_reentrancy_lock_state(t: &TestEnv) -> bool {
    t.env
        .storage()
        .instance()
        .get(&crate::storage::DataKey::ReentrancyLock)
        .unwrap_or(false)
}

// ================================================================
// Test 1: Verify fund_invoice() has reentrancy protection
// ================================================================

#[test]
fn test_fund_invoice_protected_by_reentrancy_guard() {
    let t = setup_reentrancy_test();
    let id = submit_standard_invoice(&t);

    // Before calling fund_invoice, lock should be false
    assert!(
        !get_reentrancy_lock_state(&t),
        "Reentrancy lock should be false initially"
    );

    // Call fund_invoice successfully
    t.contract
        .fund_invoice(&t.funder, &id, &INVOICE_AMOUNT)
        .unwrap();

    // After successful call, lock should be cleared (false)
    assert!(
        !get_reentrancy_lock_state(&t),
        "Reentrancy lock should be cleared after fund_invoice completes"
    );
}

// ================================================================
// Test 2: Verify mark_paid() has reentrancy protection
// ================================================================

#[test]
fn test_mark_paid_protected_by_reentrancy_guard() {
    let t = setup_reentrancy_test();
    let id = submit_standard_invoice(&t);

    // Fund the invoice first
    t.contract
        .fund_invoice(&t.funder, &id, &INVOICE_AMOUNT)
        .unwrap();

    // Before calling mark_paid, lock should be false
    assert!(
        !get_reentrancy_lock_state(&t),
        "Reentrancy lock should be false initially"
    );

    // Call mark_paid successfully
    t.contract
        .mark_paid(&id, &INVOICE_AMOUNT)
        .unwrap();

    // After successful call, lock should be cleared (false)
    assert!(
        !get_reentrancy_lock_state(&t),
        "Reentrancy lock should be cleared after mark_paid completes"
    );
}

// ================================================================
// Test 3: Verify lock is cleared after error conditions
// ================================================================

#[test]
fn test_reentrancy_lock_cleared_after_fund_invoice_error() {
    let t = setup_reentrancy_test();
    let id = submit_standard_invoice(&t);

    // First, fund the invoice successfully
    t.contract
        .fund_invoice(&t.funder, &id, &INVOICE_AMOUNT)
        .unwrap();

    // Verify lock is cleared
    assert!(
        !get_reentrancy_lock_state(&t),
        "Lock should be cleared after successful fund_invoice"
    );

    // Now try to fund again (should fail with AlreadyFunded)
    let result = t.contract.try_fund_invoice(&t.funder, &id, &INVOICE_AMOUNT);
    assert!(result.is_err(), "Second fund_invoice should fail");

    // Even after error, lock should be cleared
    assert!(
        !get_reentrancy_lock_state(&t),
        "Reentrancy lock should be cleared even after error"
    );
}

// ================================================================
// Test 4: Verify lock prevents concurrent calls via manual lock set
//
// This test manually sets the reentrancy lock to true and verifies that
// calling fund_invoice returns the Reentrancy error.
// ================================================================

#[test]
fn test_reentrancy_error_when_lock_is_set() {
    let t = setup_reentrancy_test();
    let id = submit_standard_invoice(&t);

    // Manually set the reentrancy lock to simulate a concurrent call
    t.env
        .storage()
        .instance()
        .set(&crate::storage::DataKey::ReentrancyLock, &true);

    // Verify lock is set
    assert!(
        get_reentrancy_lock_state(&t),
        "Reentrancy lock should be set"
    );

    // Attempt to call fund_invoice while lock is held
    let result = t.contract.try_fund_invoice(&t.funder, &id, &INVOICE_AMOUNT);

    // Should fail with Reentrancy error
    assert!(result.is_err(), "fund_invoice should fail when locked");
    match result {
        Err(e) => assert_eq!(e, ContractError::Reentrancy),
        Ok(_) => panic!("Expected Reentrancy error"),
    }
}

// ================================================================
// Test 5: Verify mark_paid returns Reentrancy error when locked
// ================================================================

#[test]
fn test_mark_paid_reentrancy_error_when_lock_is_set() {
    let t = setup_reentrancy_test();
    let id = submit_standard_invoice(&t);

    // Fund the invoice first
    t.contract
        .fund_invoice(&t.funder, &id, &INVOICE_AMOUNT)
        .unwrap();

    // Manually set the reentrancy lock
    t.env
        .storage()
        .instance()
        .set(&crate::storage::DataKey::ReentrancyLock, &true);

    // Attempt to call mark_paid while lock is held
    let result = t.contract.try_mark_paid(&id, &INVOICE_AMOUNT);

    // Should fail with Reentrancy error
    assert!(result.is_err(), "mark_paid should fail when locked");
    match result {
        Err(e) => assert_eq!(e, ContractError::Reentrancy),
        Ok(_) => panic!("Expected Reentrancy error"),
    }
}

// ================================================================
// Test 6: Verify guard doesn't interfere with sequential calls
//
// This test verifies that multiple sequential (non-concurrent) calls
// work correctly when the guard is properly cleared between calls.
// ================================================================

#[test]
fn test_sequential_fund_invoice_calls_succeed() {
    let t = setup_reentrancy_test();

    // Create two invoices
    let id1 = submit_standard_invoice(&t);
    let id2 = submit_standard_invoice(&t);

    // Verify both can be funded sequentially
    t.contract
        .fund_invoice(&t.funder, &id1, &INVOICE_AMOUNT)
        .unwrap();
    assert!(
        !get_reentrancy_lock_state(&t),
        "Lock should be cleared after first fund_invoice"
    );

    // Fund second invoice with different LP
    t.contract
        .fund_invoice(&t.lp_b, &id2, &INVOICE_AMOUNT)
        .unwrap();
    assert!(
        !get_reentrancy_lock_state(&t),
        "Lock should be cleared after second fund_invoice"
    );
}

// ================================================================
// Test 7: Verify guard works correctly across mixed operations
// ================================================================

#[test]
fn test_mixed_fund_and_mark_operations_succeed() {
    let t = setup_reentrancy_test();

    // Create and fund first invoice
    let id1 = submit_standard_invoice(&t);
    t.contract
        .fund_invoice(&t.funder, &id1, &INVOICE_AMOUNT)
        .unwrap();
    assert!(
        !get_reentrancy_lock_state(&t),
        "Lock should be cleared after fund_invoice"
    );

    // Mark first invoice as paid
    t.contract.mark_paid(&id1, &INVOICE_AMOUNT).unwrap();
    assert!(
        !get_reentrancy_lock_state(&t),
        "Lock should be cleared after mark_paid"
    );

    // Create and fund second invoice
    let id2 = submit_standard_invoice(&t);
    t.contract
        .fund_invoice(&t.funder, &id2, &INVOICE_AMOUNT)
        .unwrap();
    assert!(
        !get_reentrancy_lock_state(&t),
        "Lock should be cleared after second fund_invoice"
    );
}
