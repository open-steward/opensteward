/**
 * Shapes and helpers shared by the Kushki transforms.
 *
 * Every row below is one entry of `data[]` from
 * `GET /analytics/v2/transactions-list`
 * (https://api-docs.kushkipagos.com/mexico/online-payments/analytics/transactions-list-v2.md).
 * Only fields that page documents are declared.
 */
export interface RawKushkiTransaction {
  /** "Unique numeric identifier of the transactions that apply to each of the payment methods: Cash, Transfer and Card." */
  ticket_number?: string
  /** "Unique alphanumeric identifier for all transaction types." */
  transaction_reference?: string
  /** enum APPROVED, DECLINED, INITIALIZED */
  transaction_status?: string
  /** `SALE`,`CAPTURE`,`VOID`,`DEFERRED`,`PREAUTHORIZATION`,`REFUND`,`CHARGEBACK`,`PAYOUT` */
  transaction_type?: string
  approved_transaction_amount?: number
  /** "Displays the total amount the customer requested to return (card) or the amount of the transaction (cash or transfer)." */
  request_amount?: number
  currency_code?: string
  /** `format: date-time` in the schema; "Unix timestamp in milliseconds" on the Analytics overview. */
  created?: string | number
  /** "Displays the number of the sales receipt that was generated for the transaction." */
  sale_ticket_number?: string
  /** "Description of the transaction that the customer indicates when sending the request to Kushki." */
  payment_description?: string
  /** "Displays the response code sent by the processor" */
  response_code?: string
  /** "Displays the response sent by the processor" */
  response_text?: string
  /** "Only for `card` payment method. Identifier of the applied subscription." */
  subscription_id?: string
  metadata?: unknown
  [k: string]: unknown
}

/** A documented string field, or undefined when it is absent or empty. */
export function present(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  if (typeof v !== 'string') return undefined
  const s = v.trim()
  return s === '' ? undefined : s
}

/**
 * `created` as ISO-8601. The endpoint schema declares it `type: string,
 * format: date-time` (examples `'2025-02-04T15:53:45.000Z'`); the Analytics
 * overview (https://api-docs.kushkipagos.com/mexico/online-payments/analytics.md)
 * says "`created` | Unix timestamp in milliseconds" and shows `1748476800000`.
 * Both documented forms of the one field are read.
 */
export function createdIso(v: unknown): string | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v).toISOString()
  if (typeof v === 'string' && v.trim() !== '') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
  }
  return undefined
}

/**
 * The flat string entries of `metadata`. The schema declares an object; the
 * page's examples also send it as a JSON string (`'{"contractID":"157AB"}'`).
 * Nested values are left in `raw`.
 */
export function metadataMap(input: unknown): Record<string, string> {
  let obj: unknown = input
  if (typeof input === 'string') {
    try {
      obj = JSON.parse(input)
    } catch {
      return {}
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = String(v)
  }
  return out
}

/** A required documented field, or an error naming it. */
export function required(v: string | undefined, field: string, what: string): string {
  if (v === undefined) throw new Error(`Kushki ${what} has no ${field}`)
  return v
}
