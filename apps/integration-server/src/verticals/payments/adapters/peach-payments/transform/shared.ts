import { majorToMinor } from '@opensteward/shared'

/**
 * One transaction record of GET /v3/query, as the documented sample responses
 * show it ("records":[{"id":..., "paymentType":"DB", "amount":"92.00",
 * "currency":"EUR", "result":{"code":..., "description":...},
 * "customParameters":{...}, "timestamp":"2022-11-10 12:59:49.520+0000"}]).
 * https://developer.peachpayments.com/docs/oppwa-integrations-reporting
 */
export interface RawPeachTransaction {
  id?: string
  paymentType?: string
  paymentBrand?: string
  registrationId?: string
  /** "In case of referenced payment (for example, capture or refund), use this field to see which payment the system referenced." */
  referencedId?: string
  amount?: string
  currency?: string
  descriptor?: string
  result?: { code?: string; description?: string }
  customParameters?: Record<string, unknown>
  timestamp?: string
  [k: string]: unknown
}

/** GET /v3/query response envelope: `records`, plus `pages` ("pages":"8") when paginated. */
export interface RawPeachQueryResponse {
  records?: RawPeachTransaction[]
  pages?: string | number
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

/**
 * Result-code groups, each the regular expression the response-code page
 * gives for it ("The regular expression pattern for filtering out this group
 * is ..."), with the dots escaped.
 * https://developer.peachpayments.com/docs/dashboard-response-codes
 */
const SUCCESSFUL = /^(000\.000\.|000\.100\.1|000\.[36]|000\.400\.[1][12]0)/
const SUCCESSFUL_FLAGGED_FOR_REVIEW = /^(000\.400\.0[^3]|000\.400\.100)/
const PENDING = /^(000\.200|800\.400\.5|100\.400\.500)/
const CHARGEBACK = /^(000\.100\.2)/
const REJECTED =
  /^(000\.400\.[1][0-9][1-9]|000\.400\.2|800\.[17]00|800\.800\.[123]|900\.[1234]00|000\.400\.030|800\.[56]|999\.|600\.1|800\.800\.[84]|100\.39[765]|300\.100\.100|100\.400\.[0-3]|100\.380\.100|100\.380\.11|100\.380\.4|100\.380\.5|800\.400\.1|800\.400\.2|100\.390|800\.[32]|800\.1[123456]0|600\.[23]|500\.[12]|800\.121|100\.[13]50|100\.250|100\.360|700\.[1345][05]0|700\.600|700\.601|200\.[123]|100\.[53][07]|800\.900|100\.[69]00\.500|100\.800|100\.700|100\.900\.[123467890][00-99]|100\.100|100\.2[01]|100\.55|100\.380\.[23]|100\.380\.101)/

export type ResultGroup = 'succeeded' | 'pending' | 'failed' | 'chargeback' | 'unknown'

export function resultGroup(code: string | undefined): ResultGroup {
  if (!code) return 'unknown'
  if (SUCCESSFUL.test(code) || SUCCESSFUL_FLAGGED_FOR_REVIEW.test(code)) return 'succeeded'
  if (PENDING.test(code)) return 'pending'
  if (CHARGEBACK.test(code)) return 'chargeback'
  if (REJECTED.test(code)) return 'failed'
  return 'unknown'
}

/**
 * `amount` is "N10.N2 `[0-9]{1,10}\.[0-9]{2}`" with "The dot is the decimal
 * separator", and `currency` is ISO 4217 ("A3"). Both are required canonical
 * fields, so a record without them throws rather than inventing a value.
 */
export function moneyOf(
  raw: RawPeachTransaction,
  what: string,
): { amount: number; currency: string } {
  const amount = raw.amount
  const currency = raw.currency
  if (typeof amount !== 'string' || !/^[0-9]{1,10}(\.[0-9]{2})?$/.test(amount)) {
    throw new Error(`Peach Payments ${what} ${raw.id ?? ''}: no amount in the record`)
  }
  if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency)) {
    throw new Error(`Peach Payments ${what} ${raw.id ?? ''}: no currency in the record`)
  }
  const iso = currency.toUpperCase()
  return { amount: majorToMinor(Number(amount), iso), currency: iso }
}

export function requireId(raw: RawPeachTransaction, what: string): string {
  if (typeof raw.id !== 'string' || raw.id.length === 0) {
    throw new Error(`Peach Payments ${what}: record has no id`)
  }
  return raw.id
}
