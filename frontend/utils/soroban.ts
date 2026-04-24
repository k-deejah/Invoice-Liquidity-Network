import {
    Account,
    Address,
    BASE_FEE,
    nativeToScVal,
    Operation,
    rpc,
    scValToNative,
    Transaction,
    TransactionBuilder,
    xdr
} from "@stellar/stellar-sdk";
import { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL, TESTNET_EURC_TOKEN_ID, TESTNET_USDC_TOKEN_ID } from "../constants";

const server = new rpc.Server(RPC_URL);
const READ_ACCOUNT = "GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF";
const POLL_ATTEMPTS = 20;
const ACCEPTED_SEND_STATUSES = new Set(["PENDING", "DUPLICATE"]);
const DEFAULT_TOKEN_ALLOWANCE_LEDGER_BUFFER = 20_000;

export interface Invoice {
  id: bigint;
  freelancer: string;
  payer: string;
  amount: bigint;
  due_date: bigint;
  discount_rate: number;
  status: string;
  funder?: string;
  funded_at?: bigint;
  token?: string;
}

export interface SubmittedInvoiceResult {
  invoiceId: bigint;
  txHash: string;
}

export interface TokenMetadata {
  contractId: string;
  name: string;
  symbol: string;
  decimals: number;
}

const KNOWN_TOKEN_METADATA: Record<string, Omit<TokenMetadata, "contractId">> = {
  [TESTNET_USDC_TOKEN_ID]: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 7,
  },
  [TESTNET_EURC_TOKEN_ID]: {
    name: "Euro Coin",
    symbol: "EURC",
    decimals: 7,
  },
};

function buildReadTransaction(contractId: string, method: string, params: xdr.ScVal[]) {
  return new TransactionBuilder(new Account(READ_ACCOUNT, "0"), {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: contractId,
        function: method,
        args: params,
      })
    )
    .setTimeout(30)
    .build();
}

export async function getInvoiceCount(): Promise<bigint> {
  const result = await server.getHealth();
  if (result.status !== "healthy") {
    throw new Error("RPC server is not healthy");
  }

  const callResult = await server.simulateTransaction(buildReadTransaction(CONTRACT_ID, "get_invoice_count", []));

  if (rpc.Api.isSimulationSuccess(callResult)) {
    return scValToNative(callResult.result!.retval);
  } else {
    throw new Error("Failed to get invoice count");
  }
}

export async function getInvoice(id: bigint): Promise<Invoice> {
  const params: xdr.ScVal[] = [nativeToScVal(id, { type: "u64" })];
  const callResult = await server.simulateTransaction(buildReadTransaction(CONTRACT_ID, "get_invoice", params));

  if (rpc.Api.isSimulationSuccess(callResult)) {
    const native = scValToNative(callResult.result!.retval);
    return {
      id: native.id,
      freelancer: native.freelancer,
      payer: native.payer,
      amount: native.amount,
      due_date: native.due_date,
      discount_rate: native.discount_rate,
      status: parseStatus(native.status),
      funder: native.funder,
      funded_at: native.funded_at,
      token: native.token,
    };
  } else {
    throw new Error(`Failed to get invoice ${id}`);
  }
}

function parseStatus(status: unknown): string {
  if (status && typeof status === "object") {
    return Object.keys(status)[0];
  }
  return String(status);
}

export async function getAllInvoices(): Promise<Invoice[]> {
  const invoices: Invoice[] = [];
  let i = BigInt(1);
  let consecutiveFailures = 0;
  
  // Attempt to fetch invoices until we hit a failure
  // In Soroban, persistent storage IDs are typically sequential if implemented as such
  // We'll stop after a single failure since get_invoice throws if not found
  while (consecutiveFailures < 1) {
    try {
      const invoice = await getInvoice(i);
      invoices.push(invoice);
      i++;
      consecutiveFailures = 0; // reset on success
    } catch {
      // If i=1 and it fails, it might mean there are no invoices at all
      // or the contract doesn't have any data yet.
      consecutiveFailures++;
    }
    
    // Safety break to prevent infinite loop in case of weirdness
    if (i > BigInt(1000)) break; 
  }
  return invoices;
}

export async function fundInvoice(funder: string, invoice_id: bigint) {
  // This will be used with Freighter
  // For now, it just returns the transaction to be signed
  const contractAddress = CONTRACT_ID;
  const method = "fund_invoice";
  const params: xdr.ScVal[] = [
    Address.fromString(funder).toScVal(),
    nativeToScVal(invoice_id, { type: "u64" }),
    nativeToScVal(await getInvoiceRequiredFunding(invoice_id), { type: "i128" }),
  ];

  const account = await server.getAccount(funder);
  
  const tx = new TransactionBuilder(account, {
    fee: "10000", // Default fee
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: Address.fromString(contractAddress).toScAddress(),
            functionName: method,
            args: params,
          })
        ),
        auth: [], // This will be handled by Soroban simulation or manual auth
      })
    )
    .setTimeout(60 * 5)
    .build();

  // We need to simulate to get the auth and resource fees
  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  const finalTx = rpc.assembleTransaction(tx, sim).build();
  return finalTx;
}

async function getInvoiceRequiredFunding(invoiceId: bigint): Promise<bigint> {
  const invoice = await getInvoice(invoiceId);
  return invoice.amount;
}

export async function markPaid(payer: string, invoice_id: bigint) {
  const contractAddress = CONTRACT_ID;
  const method = "mark_paid";
  const params: xdr.ScVal[] = [
    nativeToScVal(invoice_id, { type: "u64" }),
  ];

  const account = await server.getAccount(payer);

  const tx = new TransactionBuilder(account, {
    fee: "10000",
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeHostFunction({
        func: xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: Address.fromString(contractAddress).toScAddress(),
            functionName: method,
            args: params,
          })
        ),
        auth: [],
      })
    )
    .setTimeout(60 * 5)
    .build();

  const sim = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(sim)) {
    throw new Error(`Simulation failed: ${sim.error}`);
  }

  const finalTx = rpc.assembleTransaction(tx, sim).build();
  return finalTx;
}

export async function submitInvoiceTransaction({
  freelancer,
  payer,
  amount,
  dueDate,
  discountRate,
  signTx,
  token = TESTNET_USDC_TOKEN_ID,
}: {
  freelancer: string;
  payer: string;
  amount: bigint;
  dueDate: number;
  discountRate: number;
  signTx: (txXdr: string) => Promise<string>;
  token?: string;
}): Promise<SubmittedInvoiceResult> {
  const sourceAccount = await server.getAccount(freelancer);

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: CONTRACT_ID,
        function: "submit_invoice",
        args: [
          Address.fromString(freelancer).toScVal(),
          Address.fromString(payer).toScVal(),
          nativeToScVal(amount, { type: "i128" }),
          nativeToScVal(dueDate, { type: "u64" }),
          nativeToScVal(discountRate, { type: "u32" }),
          Address.fromString(token).toScVal(),
        ],
      })
    )
    .setTimeout(60)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulated) || !simulated.result?.retval) {
    const message = "error" in simulated ? simulated.error : "Unable to simulate invoice submission.";
    throw new Error(`Simulation failed: ${message}`);
  }

  const simulatedInvoiceId = BigInt(scValToNative(simulated.result.retval));
  const prepared = await server.prepareTransaction(tx);
  const signedXdr = await signTx(prepared.toXDR());
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE) as Transaction;
  const sent = await server.sendTransaction(signedTx);

  if (!sent.hash || !sent.status) {
    throw new Error("RPC server returned an invalid response for invoice submission.");
  }

  if (!ACCEPTED_SEND_STATUSES.has(sent.status)) {
    throw new Error(`Transaction submission failed with status ${sent.status}.`);
  }

  const finalResult = await server.pollTransaction(sent.hash, { attempts: POLL_ATTEMPTS });
  if (finalResult.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed with status ${String(finalResult.status)}.`);
  }

  const confirmedInvoiceId = extractInvoiceIdFromTransaction(finalResult) ?? simulatedInvoiceId;

  return {
    invoiceId: confirmedInvoiceId,
    txHash: sent.hash,
  };
}

export async function getUsdcBalance(address: string, tokenId = TESTNET_USDC_TOKEN_ID): Promise<bigint> {
  return getTokenBalance(address, tokenId);
}

export async function getApprovedTokenIds(): Promise<string[]> {
  const callResult = await server.simulateTransaction(buildReadTransaction(CONTRACT_ID, "list_tokens", []));

  if (!rpc.Api.isSimulationSuccess(callResult) || !callResult.result?.retval) {
    throw new Error("Failed to fetch approved tokens.");
  }

  const native = scValToNative(callResult.result.retval);
  if (!Array.isArray(native)) {
    return [];
  }

  return native.map((value) => String(value));
}

async function readTokenContractValue(tokenId: string, method: string): Promise<unknown> {
  const callResult = await server.simulateTransaction(buildReadTransaction(tokenId, method, []));

  if (!rpc.Api.isSimulationSuccess(callResult) || !callResult.result?.retval) {
    throw new Error(`Failed to fetch token ${method}.`);
  }

  return scValToNative(callResult.result.retval);
}

export async function getTokenMetadata(tokenId: string): Promise<TokenMetadata> {
  const fallback = KNOWN_TOKEN_METADATA[tokenId];
  const [nameResult, symbolResult, decimalsResult] = await Promise.allSettled([
    readTokenContractValue(tokenId, "name"),
    readTokenContractValue(tokenId, "symbol"),
    readTokenContractValue(tokenId, "decimals"),
  ]);

  const name = nameResult.status === "fulfilled" ? String(nameResult.value) : fallback?.name ?? "Token";
  const symbol = symbolResult.status === "fulfilled" ? String(symbolResult.value) : fallback?.symbol ?? "TOKEN";
  const decimalsValue = decimalsResult.status === "fulfilled" ? Number(decimalsResult.value) : fallback?.decimals ?? 7;

  return {
    contractId: tokenId,
    name,
    symbol,
    decimals: Number.isFinite(decimalsValue) ? decimalsValue : 7,
  };
}

export async function getTokenBalance(address: string, tokenId = TESTNET_USDC_TOKEN_ID): Promise<bigint> {
  const params: xdr.ScVal[] = [Address.fromString(address).toScVal()];
  const callResult = await server.simulateTransaction(buildReadTransaction(tokenId, "balance", params));

  if (!rpc.Api.isSimulationSuccess(callResult) || !callResult.result?.retval) {
    throw new Error("Failed to fetch token balance.");
  }

  return BigInt(scValToNative(callResult.result.retval));
}

export async function getTokenAllowance({
  owner,
  spender = CONTRACT_ID,
  tokenId = TESTNET_USDC_TOKEN_ID,
}: {
  owner: string;
  spender?: string;
  tokenId?: string;
}): Promise<bigint> {
  const params: xdr.ScVal[] = [
    Address.fromString(owner).toScVal(),
    Address.fromString(spender).toScVal(),
  ];
  const callResult = await server.simulateTransaction(buildReadTransaction(tokenId, "allowance", params));

  if (!rpc.Api.isSimulationSuccess(callResult) || !callResult.result?.retval) {
    throw new Error("Failed to fetch token allowance.");
  }

  return BigInt(scValToNative(callResult.result.retval));
}

export async function getUsdcAllowance(args: {
  owner: string;
  spender?: string;
  tokenId?: string;
}): Promise<bigint> {
  return getTokenAllowance(args);
}

export async function buildApproveTokenTransaction({
  owner,
  amount,
  spender = CONTRACT_ID,
  tokenId = TESTNET_USDC_TOKEN_ID,
}: {
  owner: string;
  amount: bigint;
  spender?: string;
  tokenId?: string;
}) {
  const account = await server.getAccount(owner);
  const latestLedger = await server.getLatestLedger();
  const expirationLedger = latestLedger.sequence + DEFAULT_TOKEN_ALLOWANCE_LEDGER_BUFFER;

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: tokenId,
        function: "approve",
        args: [
          Address.fromString(owner).toScVal(),
          Address.fromString(spender).toScVal(),
          nativeToScVal(amount, { type: "i128" }),
          nativeToScVal(expirationLedger, { type: "u32" }),
        ],
      })
    )
    .setTimeout(60)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulated)) {
    const message = "error" in simulated ? simulated.error : "Unable to simulate token approval.";
    throw new Error(`Simulation failed: ${message}`);
  }

  return rpc.assembleTransaction(tx, simulated).build();
}

export async function buildApproveUsdcTransaction(args: {
  owner: string;
  amount: bigint;
  spender?: string;
  tokenId?: string;
}) {
  return buildApproveTokenTransaction(args);
}

export async function submitSignedTransaction({
  tx,
  signTx,
}: {
  tx: Transaction;
  signTx: (txXdr: string) => Promise<string>;
}): Promise<{ txHash: string }> {
  const prepared = await server.prepareTransaction(tx);
  const signedXdr = await signTx(prepared.toXDR());
  const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE) as Transaction;
  const sent = await server.sendTransaction(signedTx);

  if (!sent.hash || !sent.status) {
    throw new Error("RPC server returned an invalid transaction response.");
  }

  if (!ACCEPTED_SEND_STATUSES.has(sent.status)) {
    throw new Error(`Transaction submission failed with status ${sent.status}.`);
  }

  const finalResult = await server.pollTransaction(sent.hash, { attempts: POLL_ATTEMPTS });
  if (finalResult.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction failed with status ${String(finalResult.status)}.`);
  }

  return { txHash: sent.hash };
}

function extractInvoiceIdFromTransaction(result: unknown): bigint | null {
  if (!result || typeof result !== "object") {
    return null;
  }

  const maybe = result as {
    returnValue?: unknown;
    resultMetaXdr?: string;
  };

  if (maybe.returnValue instanceof xdr.ScVal) {
    return BigInt(scValToNative(maybe.returnValue));
  }

  if (typeof maybe.returnValue === "string") {
    try {
      const scVal = xdr.ScVal.fromXDR(maybe.returnValue, "base64");
      return BigInt(scValToNative(scVal));
    } catch {
      return null;
    }
  }

  if (maybe.resultMetaXdr) {
    try {
      const meta = xdr.TransactionMeta.fromXDR(maybe.resultMetaXdr, "base64");
      const sorobanMeta = meta.v3()?.sorobanMeta();
      const returnValue = sorobanMeta?.returnValue();

      if (returnValue) {
        return BigInt(scValToNative(returnValue));
      }
    } catch {
      return null;
    }
  }

  return null;
}

// ─── Payer score ──────────────────────────────────────────────────────────────

export interface PayerScoreResult {
  score: number;
  settled_on_time: number;
  defaults: number;
}

/**
 * Fetch the reputation score for a single payer address.
 * Returns null if the contract returns no data (new/unknown payer).
 */
export async function getPayerScore(payerAddress: string): Promise<PayerScoreResult | null> {
  try {
    const params: xdr.ScVal[] = [Address.fromString(payerAddress).toScVal()];
    const callResult = await server.simulateTransaction(
      buildReadTransaction(CONTRACT_ID, "payer_score", params)
    );

    if (!rpc.Api.isSimulationSuccess(callResult) || !callResult.result?.retval) {
      return null;
    }

    const native = scValToNative(callResult.result.retval);
    // If the contract returns None/null for an unknown payer
    if (native === null || native === undefined) return null;

    return {
      score: Number(native.score ?? native),
      settled_on_time: Number(native.settled_on_time ?? 0),
      defaults: Number(native.defaults ?? 0),
    };
  } catch {
    // Unknown payer or function not present — treat as no score
    return null;
  }
}

/**
 * Fetch payer scores for a batch of unique addresses in parallel.
 * Returns a Map from address → score result (or null).
 * Deduplicates addresses before fetching.
 */
export async function getPayerScoresBatch(
  addresses: string[]
): Promise<Map<string, PayerScoreResult | null>> {
  const unique = [...new Set(addresses)];
  const results = await Promise.allSettled(unique.map((addr) => getPayerScore(addr)));

  const map = new Map<string, PayerScoreResult | null>();
  unique.forEach((addr, i) => {
    const result = results[i];
    map.set(addr, result.status === "fulfilled" ? result.value : null);
  });
  return map;
}

