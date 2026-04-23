
// ─── Types ───────────────────────────────────────────────────────────────────

export type ProposalType = "ParameterUpdate" | "ProtocolUpgrade" | "TextProposal";
export type ProposalStatus = "Active" | "Passed" | "Failed" | "Executed" | "Pending";
export type VoteChoice = "For" | "Against" | "Abstain";

export interface ParameterChange {
  parameter: string;
  currentValue: string;
  newValue: string;
}

export interface Proposal {
  id: number;
  title: string;
  description: string;
  type: ProposalType;
  status: ProposalStatus;
  proposer: string;
  createdAt: number;
  votingStartsAt: number;
  votingEndsAt: number;
  executableAfter?: number;
  votesFor: number;
  votesAgainst: number;
  votesAbstain: number;
  quorumRequired: number;
  parameterChanges?: ParameterChange[];
  userVote?: VoteChoice;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const NOW = Math.floor(Date.now() / 1000);
const DAY = 86400;

export const MOCK_PROPOSALS: Proposal[] = [
  {
    id: 1,
    title: "Reduce Base Discount Rate to 3.5%",
    description:
      "This proposal reduces the protocol's base discount rate from 5% to 3.5% to improve competitiveness with traditional invoice factoring services and attract higher invoice volume from freelancers.",
    type: "ParameterUpdate",
    status: "Active",
    proposer: "GDXYZ...A3KP",
    createdAt: NOW - 2 * DAY,
    votingStartsAt: NOW - 2 * DAY,
    votingEndsAt: NOW + 5 * DAY,
    votesFor: 142_500,
    votesAgainst: 38_200,
    votesAbstain: 9_100,
    quorumRequired: 100_000,
    parameterChanges: [
      { parameter: "base_discount_rate", currentValue: "500 (5%)", newValue: "350 (3.5%)" },
    ],
  },
  {
    id: 2,
    title: "Increase Quorum Threshold to 15%",
    description:
      "To ensure governance decisions represent a meaningful fraction of the token supply, this proposal raises the minimum quorum from 10% to 15% of circulating ILN tokens.",
    type: "ParameterUpdate",
    status: "Active",
    proposer: "GBCDE...F7QR",
    createdAt: NOW - 1 * DAY,
    votingStartsAt: NOW - 1 * DAY,
    votingEndsAt: NOW + 6 * DAY,
    votesFor: 56_000,
    votesAgainst: 71_300,
    votesAbstain: 4_200,
    quorumRequired: 100_000,
    parameterChanges: [
      { parameter: "quorum_threshold_bps", currentValue: "1000 (10%)", newValue: "1500 (15%)" },
    ],
  },
  {
    id: 3,
    title: "Add EURC as Accepted Invoice Currency",
    description:
      "Expand the protocol's multi-token support by adding EURC (Euro Coin) as a valid invoice denomination alongside USDC. This targets European freelancers and eliminates FX conversion costs.",
    type: "ProtocolUpgrade",
    status: "Passed",
    proposer: "GCFGH...B2MN",
    createdAt: NOW - 14 * DAY,
    votingStartsAt: NOW - 14 * DAY,
    votingEndsAt: NOW - 7 * DAY,
    executableAfter: NOW - 4 * DAY,
    votesFor: 215_800,
    votesAgainst: 44_100,
    votesAbstain: 12_400,
    quorumRequired: 100_000,
    parameterChanges: [
      {
        parameter: "accepted_tokens",
        currentValue: "[USDC]",
        newValue: "[USDC, EURC]",
      },
    ],
  },
  {
    id: 4,
    title: "Extend Voting Period to 10 Days",
    description:
      "Increase the governance voting window from 7 days to 10 days to give token holders across all time zones and schedules adequate opportunity to participate.",
    type: "ParameterUpdate",
    status: "Executed",
    proposer: "GHIJK...L9PQ",
    createdAt: NOW - 30 * DAY,
    votingStartsAt: NOW - 30 * DAY,
    votingEndsAt: NOW - 23 * DAY,
    executableAfter: NOW - 20 * DAY,
    votesFor: 189_600,
    votesAgainst: 22_300,
    votesAbstain: 6_100,
    quorumRequired: 100_000,
    parameterChanges: [
      { parameter: "voting_period_seconds", currentValue: "604800 (7 days)", newValue: "864000 (10 days)" },
    ],
  },
  {
    id: 5,
    title: "Signal: Explore On-Chain Credit Scoring Integration",
    description:
      "A text proposal to gauge community sentiment on integrating a decentralised on-chain credit scoring module that could lower discount rates for freelancers with proven track records.",
    type: "TextProposal",
    status: "Failed",
    proposer: "GLMNO...P4RS",
    createdAt: NOW - 20 * DAY,
    votingStartsAt: NOW - 20 * DAY,
    votingEndsAt: NOW - 13 * DAY,
    votesFor: 44_200,
    votesAgainst: 88_700,
    votesAbstain: 11_500,
    quorumRequired: 100_000,
  },
  {
    id: 6,
    title: "Deploy LP Yield Optimiser Contract",
    description:
      "Deploy a new ancillary contract that auto-compounds LP yield by re-deploying earned USDC into the highest-APY invoice pool at the end of each epoch.",
    type: "ProtocolUpgrade",
    status: "Active",
    proposer: "GTUV...W5XY",
    createdAt: NOW - 3 * DAY,
    votingStartsAt: NOW - 3 * DAY,
    votingEndsAt: NOW + 4 * DAY,
    votesFor: 87_400,
    votesAgainst: 19_800,
    votesAbstain: 3_600,
    quorumRequired: 100_000,
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function totalVotes(proposal: Proposal): number {
  return proposal.votesFor + proposal.votesAgainst + proposal.votesAbstain;
}

export function votePercent(votes: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((votes / total) * 1000) / 10; // one decimal place
}

export function quorumReached(proposal: Proposal): boolean {
  return totalVotes(proposal) >= proposal.quorumRequired;
}

export function timeRemaining(proposal: Proposal): string {
  const now = Math.floor(Date.now() / 1000);
  if (proposal.status !== "Active") return "";
  const diff = proposal.votingEndsAt - now;
  if (diff <= 0) return "Ended";
  const days = Math.floor(diff / DAY);
  const hours = Math.floor((diff % DAY) / 3600);
  if (days > 0) return `${days}d ${hours}h remaining`;
  const mins = Math.floor((diff % 3600) / 60);
  return `${hours}h ${mins}m remaining`;
}

export function formatVotingPower(power: number): string {
  if (power >= 1_000_000) return (power / 1_000_000).toFixed(2) + "M ILN";
  if (power >= 1_000) return (power / 1_000).toFixed(1) + "K ILN";
  return power.toFixed(0) + " ILN";
}

// ─── Mock voting state (per-session in-memory store) ──────────────────────────

const userVotes: Map<number, VoteChoice> = new Map();

export function getUserVote(proposalId: number): VoteChoice | undefined {
  return userVotes.get(proposalId);
}

// ─── Simulated contract calls ─────────────────────────────────────────────────

export async function fetchProposals(): Promise<Proposal[]> {
  // TODO: Replace with actual Soroban contract call once governance contract is deployed
  await new Promise((r) => setTimeout(r, 600));
  return MOCK_PROPOSALS.map((p) => ({
    ...p,
    userVote: userVotes.get(p.id),
  }));
}

export async function fetchProposal(id: number): Promise<Proposal | null> {
  await new Promise((r) => setTimeout(r, 300));
  const proposal = MOCK_PROPOSALS.find((p) => p.id === id);
  if (!proposal) return null;
  return { ...proposal, userVote: userVotes.get(id) };
}

export async function castVote(
  proposalId: number,
  choice: VoteChoice,
  _signerAddress: string,
  _signTx: (xdr: string) => Promise<string>
): Promise<string> {
  // TODO: Replace with actual Soroban transaction once governance contract is deployed
  await new Promise((r) => setTimeout(r, 2000));

  userVotes.set(proposalId, choice);

  const proposal = MOCK_PROPOSALS.find((p) => p.id === proposalId);
  if (proposal) {
    const power = 1250;
    if (choice === "For") proposal.votesFor += power;
    else if (choice === "Against") proposal.votesAgainst += power;
    else proposal.votesAbstain += power;
  }

  // Return a simulated tx hash
  return Math.random().toString(16).substring(2, 18);
}

export async function executeProposal(
  proposalId: number,
  _signerAddress: string,
  _signTx: (xdr: string) => Promise<string>
): Promise<string> {
  // TODO: Replace with actual Soroban transaction once governance contract is deployed
  await new Promise((r) => setTimeout(r, 2000));

  const proposal = MOCK_PROPOSALS.find((p) => p.id === proposalId);
  if (proposal) {
    proposal.status = "Executed";
  }

  return Math.random().toString(16).substring(2, 18);
}

export async function getVotingPower(_address: string): Promise<number> {
  // TODO: Fetch from ILN token contract once deployed
  await new Promise((r) => setTimeout(r, 200));
  return 1250; // mock: 1,250 ILN tokens
}

// ─── Proposal creation ────────────────────────────────────────────────────────

/** The four form-level proposal types exposed in the creation UI */
export type CreateProposalFormType =
  | "FeeRate"
  | "AddToken"
  | "RemoveToken"
  | "MaxDiscountRate";

export interface AcceptedToken {
  address: string;
  name: string;
  symbol: string;
}

export interface ProtocolParameters {
  /** Current protocol fee rate in basis points (e.g. 50 = 0.5%) */
  feeRateBps: number;
  /** Current maximum discount rate in basis points (e.g. 500 = 5%) */
  maxDiscountRateBps: number;
  /** Tokens currently accepted by the protocol */
  acceptedTokens: AcceptedToken[];
  /** Minimum ILN balance required to submit a proposal */
  minProposalILN: number;
}

export interface CreateProposalPayload {
  formType: CreateProposalFormType;
  title: string;
  description: string;
  /** New basis-point value for FeeRate / MaxDiscountRate proposals */
  newValueBps?: number;
  /** Token address for AddToken proposals */
  tokenAddress?: string;
  /** Resolved token name (AddToken) */
  tokenName?: string;
  /** Token address to remove (RemoveToken) */
  removeTokenAddress?: string;
}

// ─── Mock protocol parameter state ───────────────────────────────────────────

const MOCK_PROTOCOL_PARAMS: ProtocolParameters = {
  feeRateBps: 50,         // 0.5%
  maxDiscountRateBps: 500, // 5%
  acceptedTokens: [
    {
      address: "CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75",
      name: "USD Coin",
      symbol: "USDC",
    },
    {
      address: "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV",
      name: "Euro Coin",
      symbol: "EURC",
    },
  ],
  minProposalILN: 500,
};

/**
 * Fetch current on-chain protocol parameters.
 * TODO: Replace with actual Soroban read-only calls once governance contract is deployed.
 */
export async function fetchProtocolParameters(): Promise<ProtocolParameters> {
  await new Promise((r) => setTimeout(r, 400));
  return { ...MOCK_PROTOCOL_PARAMS };
}

/** Stellar address basic format check: starts with G, 56 chars, valid base-32 charset */
const STELLAR_ADDRESS_RE = /^G[A-Z2-7]{55}$/;

export function isValidStellarAddress(address: string): boolean {
  return STELLAR_ADDRESS_RE.test(address.trim());
}

/**
 * Validate and look up a token name from a Stellar asset address.
 * Returns the resolved AcceptedToken or throws a descriptive error.
 * TODO: Replace with real Stellar SDK / Horizon lookup once deployed.
 */
export async function lookupToken(address: string): Promise<AcceptedToken> {
  if (!isValidStellarAddress(address)) {
    throw new Error("Invalid Stellar address. Must start with G and be 56 characters.");
  }

  await new Promise((r) => setTimeout(r, 800));

  // Check if it's already an accepted token
  const existing = MOCK_PROTOCOL_PARAMS.acceptedTokens.find(
    (t) => t.address === address.trim()
  );
  if (existing) {
    throw new Error(`${existing.symbol} is already an accepted token.`);
  }

  // Simulate a small set of "known" testnet tokens
  const KNOWN_TOKENS: Record<string, AcceptedToken> = {
    CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC: {
      address: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
      name: "Wrapped Bitcoin",
      symbol: "wBTC",
    },
    CAZF3TRE3TFUMYQ7GDBP2HMRH4CW4GI7XPQFVFYXFBXNJLKH2BLNSJP: {
      address: "CAZF3TRE3TFUMYQ7GDBP2HMRH4CW4GI7XPQFVFYXFBXNJLKH2BLNSJP",
      name: "Wrapped Ether",
      symbol: "wETH",
    },
    CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA: {
      address: "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA",
      name: "Stellar AQUA",
      symbol: "AQUA",
    },
  };

  const known = KNOWN_TOKENS[address.trim()];
  if (known) return known;

  // For unknown addresses, return a generic placeholder (real impl would query Horizon)
  return {
    address: address.trim(),
    name: "Unknown Token",
    symbol: address.slice(0, 4).toUpperCase(),
  };
}

/**
 * Submit a new governance proposal to the contract.
 * TODO: Replace with actual Soroban transaction once governance contract is deployed.
 */
export async function createProposal(
  payload: CreateProposalPayload,
  _signerAddress: string,
  _signTx: (xdr: string) => Promise<string>
): Promise<{ txHash: string; proposalId: number }> {
  await new Promise((r) => setTimeout(r, 2500));

  const newId = MOCK_PROPOSALS.length + 1;
  const NOW_SEC = Math.floor(Date.now() / 1000);
  const DAY_SEC = 86400;

  // Map form type → internal ProposalType
  const typeMap: Record<CreateProposalFormType, ProposalType> = {
    FeeRate: "ParameterUpdate",
    MaxDiscountRate: "ParameterUpdate",
    AddToken: "ProtocolUpgrade",
    RemoveToken: "ProtocolUpgrade",
  };

  // Map form type → parameter change
  let parameterChanges: ParameterChange[] | undefined;
  if (payload.formType === "FeeRate" && payload.newValueBps !== undefined) {
    parameterChanges = [
      {
        parameter: "fee_rate_bps",
        currentValue: `${MOCK_PROTOCOL_PARAMS.feeRateBps} (${MOCK_PROTOCOL_PARAMS.feeRateBps / 100}%)`,
        newValue: `${payload.newValueBps} (${payload.newValueBps / 100}%)`,
      },
    ];
  } else if (payload.formType === "MaxDiscountRate" && payload.newValueBps !== undefined) {
    parameterChanges = [
      {
        parameter: "max_discount_rate_bps",
        currentValue: `${MOCK_PROTOCOL_PARAMS.maxDiscountRateBps} (${MOCK_PROTOCOL_PARAMS.maxDiscountRateBps / 100}%)`,
        newValue: `${payload.newValueBps} (${payload.newValueBps / 100}%)`,
      },
    ];
  } else if (payload.formType === "AddToken" && payload.tokenAddress) {
    const existing = MOCK_PROTOCOL_PARAMS.acceptedTokens.map((t) => t.symbol);
    parameterChanges = [
      {
        parameter: "accepted_tokens",
        currentValue: `[${existing.join(", ")}]`,
        newValue: `[${existing.join(", ")}, ${payload.tokenName ?? payload.tokenAddress.slice(0, 6)}]`,
      },
    ];
  } else if (payload.formType === "RemoveToken" && payload.removeTokenAddress) {
    const token = MOCK_PROTOCOL_PARAMS.acceptedTokens.find(
      (t) => t.address === payload.removeTokenAddress
    );
    const remaining = MOCK_PROTOCOL_PARAMS.acceptedTokens
      .filter((t) => t.address !== payload.removeTokenAddress)
      .map((t) => t.symbol);
    parameterChanges = [
      {
        parameter: "accepted_tokens",
        currentValue: `[${MOCK_PROTOCOL_PARAMS.acceptedTokens.map((t) => t.symbol).join(", ")}]`,
        newValue: `[${remaining.join(", ")}]${token ? ` (removes ${token.symbol})` : ""}`,
      },
    ];
  }

  const newProposal: Proposal = {
    id: newId,
    title: payload.title,
    description: payload.description,
    type: typeMap[payload.formType],
    status: "Active",
    proposer: _signerAddress,
    createdAt: NOW_SEC,
    votingStartsAt: NOW_SEC,
    votingEndsAt: NOW_SEC + 7 * DAY_SEC,
    votesFor: 0,
    votesAgainst: 0,
    votesAbstain: 0,
    quorumRequired: 100_000,
    parameterChanges,
  };

  MOCK_PROPOSALS.push(newProposal);

  return {
    txHash: Math.random().toString(16).substring(2, 18),
    proposalId: newId,
  };
}
