import { majorToMinor } from '@opensteward/shared'

export function pickCurrency(v: string | null | undefined, fallback = 'USD'): string {
  if (!v || typeof v !== 'string') return fallback
  return v.toUpperCase()
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
 * Safely convert an amount in major units (e.g. dollars) to minor units (cents).
 * If the platform already returns minor units, pass the value through.
 */
export function toMinorUnits(amount: unknown, factor = 100): number {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount ?? '0'))
  if (!isFinite(n)) return 0
  return Math.round(n * factor)
}

/**
 * Safely parse a number and return 0 if invalid.
 */
export function safeInt(v: unknown): number {
  if (typeof v === 'number') return Math.round(v)
  const n = parseInt(String(v ?? '0'), 10)
  return isFinite(n) ? n : 0
}

/**
 * The runtime's ISO 4217 code list (ICU). A shape check such as
 * `/^[A-Z]{3}$/` is not enough: TransFi documents crypto payins in `SOL`
 * (https://docs.transfi.com/docs/webhook-events-payin.md, `"depositCurrency":
 * "SOL"`, `"sourceCurrencyType": "crypto"`), and "Crypto amounts use full
 * token units to 8 decimals" (https://docs.transfi.com/docs/api-concepts.md),
 * so a three-letter token must not be scaled as a two-decimal fiat currency.
 */
const ISO_4217 = new Set(Intl.supportedValuesOf('currency'))

/** One side of a v3 order: `source` or `destination`, `{ currency, amount }`. */
export interface RawTransfiOrderSide {
  currency?: string
  amount?: string
  [k: string]: unknown
}

/**
 * The integer minor-unit amount and currency of one side of an order.
 *
 * "Fiat amounts are full currency value (5000 = KES 5,000, not minor units)"
 * and amounts arrive as strings (`"amount": "171729"`) —
 * https://docs.transfi.com/docs/api-concepts.md,
 * https://docs.transfi.com/reference/get-order.md. A side with no amount, or
 * a currency that is not a three-letter ISO 4217 code (crypto legs such as
 * `USDT` or `USDTPOLYGON`), has no canonical money: the order is refused
 * rather than given an invented amount or currency.
 */
export function orderSideMoney(
  orderId: string,
  sideName: 'source' | 'destination',
  side: RawTransfiOrderSide | undefined,
): { amount: number; currency: string } {
  const currency = typeof side?.currency === 'string' ? side.currency : undefined
  const text = typeof side?.amount === 'string' ? side.amount.trim() : undefined
  const n = text !== undefined && text !== '' ? Number(text) : NaN
  if (!currency || !ISO_4217.has(currency)) {
    throw new Error(
      `TransFi order ${orderId}: ${sideName}.currency ${JSON.stringify(currency ?? null)} is not an ISO 4217 fiat currency`,
    )
  }
  const amount = majorToMinor(Number.isFinite(n) ? n : undefined, currency)
  if (amount === undefined) {
    throw new Error(`TransFi order ${orderId}: ${sideName}.amount is missing or not a number`)
  }
  return { amount, currency }
}
