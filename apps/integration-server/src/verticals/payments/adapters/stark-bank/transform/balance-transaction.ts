import { toIsoDatetime } from '@opensteward/shared'
import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'
import { CURRENCY } from '../constants'
import { intOrUndefined, requireId, strOrUndefined, tagsMetadata } from './shared'

/**
 * Stark Bank Transaction (the account statement), as `GET /v2/transaction`
 * ("transactions") and `GET /v2/transaction/:id` ("transaction") return it.
 * Docs: https://docs.starkbank.com/api (The Transaction object).
 */
export interface RawStarkBankTransaction {
  id?: string
  /** "Transaction amount in cents of reais. Negative values represent cash-out." */
  amount?: number
  /** "Fee charged by the transaction in cents of reais." */
  fee?: number
  description?: string
  /** "Reference to the operation that generated this transaction. Example: transfer/1234567890" */
  source?: string
  created?: string
  tags?: string[]
  [k: string]: unknown
}

/**
 * The documented `source` values are "<entity>/<id>" (e.g. "transfer/1234567890",
 * "invoice/6394476721340416") or "self" for a transaction created through
 * POST /v2/transaction. Only transfer and invoice have a canonical type.
 */
function mapType(entity: string | undefined): BalanceTransactionType {
  if (entity === 'transfer') return 'transfer'
  if (entity === 'invoice') return 'charge'
  return 'other'
}

export function transformBalanceTransaction(raw: RawStarkBankTransaction): BalanceTransaction {
  const id = requireId(raw, 'transaction')
  const amount = intOrUndefined(raw.amount)
  if (amount === undefined) throw new Error(`Stark Bank transaction ${id} has no amount`)
  const source = strOrUndefined(raw.source)
  const slash = source?.indexOf('/') ?? -1
  const sourceType = source === undefined ? undefined : slash > 0 ? source.slice(0, slash) : source
  const sourceId = source !== undefined && slash > 0 ? source.slice(slash + 1) : undefined
  return {
    id,
    externalId: id,
    type: mapType(sourceType),
    amount,
    currency: CURRENCY,
    fee: intOrUndefined(raw.fee),
    sourceId,
    sourceType,
    description: strOrUndefined(raw.description),
    gateway: 'stark-bank',
    metadata: tagsMetadata(raw.tags),
    createdAt: toIsoDatetime(raw.created),
    raw,
  }
}
