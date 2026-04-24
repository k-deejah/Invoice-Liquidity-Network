#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token::Client as TokenClient, vec, Address, Env, IntoVal, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ProposalType {
    UpdateFeeRate(u32),
    AddToken(Address),
    RemoveToken(Address),
    UpdateMaxDiscountRate(u32),
}

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum ProposalStatus {
    Active,
    Passed,
    Failed,
    Executed,
}

#[contracttype]
#[derive(Clone, Debug)]
pub struct Proposal {
    pub id: u64,
    pub creator: Address,
    pub proposal_type: ProposalType,
    pub votes_for: i128,
    pub votes_against: i128,
    pub status: ProposalStatus,
    pub end_time: u64,
}

#[contracttype]
pub enum StorageKey {
    IlnContract,
    GovToken,
    Proposal(u64),
    ProposalCount,
    HasVoted(u64, Address),
}

#[contract]
pub struct GovContract;

#[contractimpl]
impl GovContract {
    pub fn initialize(env: Env, iln_contract: Address, gov_token: Address) {
        if env.storage().instance().has(&StorageKey::IlnContract) {
            panic!("already initialized");
        }
        env.storage().instance().set(&StorageKey::IlnContract, &iln_contract);
        env.storage().instance().set(&StorageKey::GovToken, &gov_token);
        env.storage().instance().set(&StorageKey::ProposalCount, &0_u64);
    }

    pub fn create_proposal(
        env: Env,
        creator: Address,
        proposal_type: ProposalType,
    ) -> u64 {
        creator.require_auth();

        let count: u64 = env.storage().instance().get(&StorageKey::ProposalCount).unwrap_or(0);
        let id = count + 1;

        // 3-day voting window
        let end_time = env.ledger().timestamp() + 259200;

        let proposal = Proposal {
            id,
            creator,
            proposal_type,
            votes_for: 0,
            votes_against: 0,
            status: ProposalStatus::Active,
            end_time,
        };

        env.storage().persistent().set(&StorageKey::Proposal(id), &proposal);
        env.storage().instance().set(&StorageKey::ProposalCount, &id);

        id
    }

    pub fn vote(env: Env, voter: Address, proposal_id: u64, support: bool) {
        voter.require_auth();

        let mut proposal: Proposal = env.storage().persistent().get(&StorageKey::Proposal(proposal_id)).expect("not found");
        
        let now = env.ledger().timestamp();
        if now >= proposal.end_time {
            panic!("voting ended");
        }
        if proposal.status != ProposalStatus::Active {
            panic!("not active");
        }

        let voted_key = StorageKey::HasVoted(proposal_id, voter.clone());
        if env.storage().persistent().has(&voted_key) {
            panic!("already voted");
        }

        let token_addr: Address = env.storage().instance().get(&StorageKey::GovToken).unwrap();
        let token = TokenClient::new(&env, &token_addr);
        let power = token.balance(&voter);
        if power == 0 {
            panic!("no voting power");
        }

        if support {
            proposal.votes_for += power;
        } else {
            proposal.votes_against += power;
        }

        env.storage().persistent().set(&voted_key, &true);
        env.storage().persistent().set(&StorageKey::Proposal(proposal_id), &proposal);
    }

    pub fn execute_proposal(env: Env, proposal_id: u64, total_supply: i128) {
        let mut proposal: Proposal = env.storage().persistent().get(&StorageKey::Proposal(proposal_id)).expect("not found");
        let now = env.ledger().timestamp();

        if now < proposal.end_time {
            panic!("voting ongoing");
        }
        if proposal.status != ProposalStatus::Active {
            panic!("already resolved");
        }

        let total_votes = proposal.votes_for + proposal.votes_against;
        let quorum = total_supply / 10; // 10% quorum

        if total_votes < quorum {
            proposal.status = ProposalStatus::Failed;
            env.storage().persistent().set(&StorageKey::Proposal(proposal_id), &proposal);
            panic!("quorum not reached");
        }

        if proposal.votes_for > proposal.votes_against {
            proposal.status = ProposalStatus::Passed;
        } else {
            proposal.status = ProposalStatus::Failed;
            env.storage().persistent().set(&StorageKey::Proposal(proposal_id), &proposal);
            panic!("proposal rejected");
        }

        let iln_contract: Address = env.storage().instance().get(&StorageKey::IlnContract).unwrap();
        
        match proposal.proposal_type.clone() {
            ProposalType::UpdateFeeRate(rate) => {
                let args: Vec<soroban_sdk::Val> = vec![&env, rate.into_val(&env)];
                env.invoke_contract::<()>(&iln_contract, &Symbol::new(&env, "update_fee_rate"), args);
            }
            ProposalType::AddToken(token) => {
                let args: Vec<soroban_sdk::Val> = vec![&env, token.into_val(&env)];
                env.invoke_contract::<()>(&iln_contract, &Symbol::new(&env, "add_token"), args);
            }
            ProposalType::RemoveToken(token) => {
                let args: Vec<soroban_sdk::Val> = vec![&env, token.into_val(&env)];
                env.invoke_contract::<()>(&iln_contract, &Symbol::new(&env, "remove_token"), args);
            }
            ProposalType::UpdateMaxDiscountRate(rate) => {
                let args: Vec<soroban_sdk::Val> = vec![&env, rate.into_val(&env)];
                env.invoke_contract::<()>(&iln_contract, &Symbol::new(&env, "update_max_discount"), args);
            }
        }

        proposal.status = ProposalStatus::Executed;
        env.storage().persistent().set(&StorageKey::Proposal(proposal_id), &proposal);
    }

    pub fn get_proposal(env: Env, proposal_id: u64) -> Proposal {
        env.storage().persistent().get(&StorageKey::Proposal(proposal_id)).expect("not found")
    }
}
