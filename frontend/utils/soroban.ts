import {
    Account,
    Address,
    nativeToScVal,
    Operation,
    rpc,
    scValToNative,
    TransactionBuilder,
    xdr
} from "@stellar/stellar-sdk";
import { CONTRACT_ID, NETWORK_PASSPHRASE, RPC_URL } from "../constants";

const server = new rpc.Server(RPC_URL);

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
}

export async function getInvoiceCount(): Promise<bigint> {
  const result = await server.getHealth();
  if (result.status !== "healthy") {
    throw new Error("RPC server is not healthy");
  }

  const contractAddress = CONTRACT_ID;
  const method = "get_invoice_count";
  const params: xdr.ScVal[] = [];

  const dummyAccount = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

  const callResult = await server.simulateTransaction(
    new TransactionBuilder(dummyAccount, { 
      fee: "100", 
      networkPassphrase: NETWORK_PASSPHRASE 
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
      .setTimeout(0)
      .build()
  );

  if (rpc.Api.isSimulationSuccess(callResult)) {
    return scValToNative(callResult.result!.retval);
  } else {
    throw new Error("Failed to get invoice count");
  }
}

export async function getInvoice(id: bigint): Promise<Invoice> {
  const contractAddress = CONTRACT_ID;
  const method = "get_invoice";
  const params: xdr.ScVal[] = [nativeToScVal(id, { type: "u64" })];

  const dummyAccount = new Account("GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF", "0");

  const callResult = await server.simulateTransaction(
    new TransactionBuilder(dummyAccount, { 
      fee: "100", 
      networkPassphrase: NETWORK_PASSPHRASE 
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
      .setTimeout(0)
      .build()
  );

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
    };
  } else {
    throw new Error(`Failed to get invoice ${id}`);
  }
}

function parseStatus(status: any): string {
  if (typeof status === 'object') {
    return Object.keys(status)[0];
  }
  return status;
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
    } catch (e) {
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
  ];

  const funderAddress = Address.fromString(funder);
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
