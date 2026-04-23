import {
  xdr,
  rpc,
  Address,
  scValToNative,
  nativeToScVal,
  TransactionBuilder,
  Networks,
  Operation,
  Account,
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
  const count = await getInvoiceCount();
  const invoices: Invoice[] = [];
  for (let i = BigInt(1); i <= count; i++) {
    try {
      const invoice = await getInvoice(i);
      invoices.push(invoice);
    } catch (e) {
      console.error(`Failed to fetch invoice ${i}`, e);
    }
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
