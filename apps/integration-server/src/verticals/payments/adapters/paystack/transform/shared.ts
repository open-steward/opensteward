/**
 * Paystack returns money in kobo / cents — integer minor units already.
 * Default currency NGN unless the merchant has been onboarded for
 * multi-currency (USD/GHS/ZAR/KES).
 */
export function pickCurrency(v: string | null | undefined): string {
  return (v ?? 'NGN').toUpperCase()
}

export function strMap(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null) continue
    out[k] = String(v)
  }
  return out
}
