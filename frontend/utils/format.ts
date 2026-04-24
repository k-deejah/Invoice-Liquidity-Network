export interface TokenDisplayMeta {
  symbol: string;
  decimals: number;
}

export function formatTokenAmount(
  amount: bigint,
  token: TokenDisplayMeta = { symbol: "USDC", decimals: 7 },
): string {
  const negative = amount < 0n;
  const absolute = negative ? amount * -1n : amount;
  const divisor = 10n ** BigInt(token.decimals);
  const whole = absolute / divisor;
  const fraction = absolute % divisor;
  const trimmedFraction = fraction
    .toString()
    .padStart(token.decimals, "0")
    .replace(/0+$/, "");
  const formattedWhole = new Intl.NumberFormat("en-US").format(Number(whole));
  const value = trimmedFraction ? `${formattedWhole}.${trimmedFraction}` : formattedWhole;

  return `${negative ? "-" : ""}${value} ${token.symbol}`;
}

export function formatUSDC(amount: bigint): string {
  return formatTokenAmount(amount, { symbol: "USDC", decimals: 7 });
export function formatTokenAmount(amount: bigint | string | number, decimals: number, symbol: string): string {
  const value = Number(amount) / Math.pow(10, decimals);
  
  // Use Intl.NumberFormat for regular numbers with grouping
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });
  
  return `${formatter.format(value)} ${symbol}`;
}

export function formatUSDC(amount: bigint): string {
  return formatTokenAmount(amount, 7, 'USDC');
}

export function formatAddress(address: string): string {
  if (!address) return "";
  return address.substring(0, 6) + "..." + address.substring(address.length - 4);
}

export function formatDate(timestamp: bigint): string {
  return new Date(Number(timestamp) * 1000).toLocaleDateString();
}

export function calculateYield(amount: bigint, discount_rate: number): bigint {
  return (amount * BigInt(discount_rate)) / BigInt(10_000);
}
