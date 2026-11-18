/**
 * Shapes shared by the Moneris API 2.15.1 schemas
 * (https://developer.moneris.com/moneris-api/reference/getpayments.md).
 */

/** `money`: "Monetary amount. Note: The value must be in cents." `"required": ["amount", "currency"]`. */
export interface MonerisMoney {
  amount: number
  currency: string
}

/**
 * `customData`: "Merchant can send custom meta data with the transaction in
 * this object." `additionalProperties: { "type": "string" }`, nullable.
 */
export type MonerisCustomData = Record<string, string> | null | undefined

/** The documented `customData` object as a string map; null is empty. */
export function customDataToMetadata(data: MonerisCustomData): Record<string, string> {
  const out: Record<string, string> = {}
  if (!data) return out
  for (const [k, v] of Object.entries(data)) if (typeof v === 'string') out[k] = v
  return out
}

/** Throw when a field the canonical schema requires is missing from a Moneris record. */
export function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined || value === '') {
    throw new Error(`Moneris ${what} is missing from the response`)
  }
  return value
}
