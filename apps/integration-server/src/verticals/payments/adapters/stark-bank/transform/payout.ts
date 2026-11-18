import { toIsoDatetime } from '@opensteward/shared'
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { CURRENCY } from '../constants'
import { intOrUndefined, requireId, strOrUndefined, tagsMetadata } from './shared'

/**
 * Stark Bank Transfer, as `GET /v2/transfer` ("transfers") and
 * `GET /v2/transfer/:id` ("transfer") return it.
 * Docs: https://docs.starkbank.com/api (The Transfer object).
 */
export interface RawStarkBankTransfer {
  id?: string
  /** "Amount in cents to be transferred. Example: 100 (R$1.00)." */
  amount?: number
  status?: string
  /** "Receiver bank account number." e.g. "76543-8" */
  accountNumber?: string
  /** "Text displayed in the bank statement." */
  description?: string
  created?: string
  updated?: string
  tags?: string[]
  [k: string]: unknown
}

/**
 * "status STRING Current transfer status. Options: "created", "processing",
 * "confirmed", "success", "failed", "canceled"." The docs describe no
 * meaning for "confirmed" (the status diagram omits it), so it maps to unknown.
 */
function mapStatus(s: unknown): PayoutStatus {
  switch (s) {
    case 'created':
      return 'pending'
    case 'processing':
      return 'in_transit'
    case 'success':
      return 'paid'
    case 'failed':
      return 'failed'
    case 'canceled':
      return 'cancelled'
    default:
      return 'unknown'
  }
}

export function transformPayout(raw: RawStarkBankTransfer): Payout {
  const id = requireId(raw, 'transfer')
  const amount = intOrUndefined(raw.amount)
  if (amount === undefined) throw new Error(`Stark Bank transfer ${id} has no amount`)
  const digits = typeof raw.accountNumber === 'string' ? raw.accountNumber.replace(/\D/g, '') : ''
  return {
    id,
    externalId: id,
    amount,
    currency: CURRENCY,
    status: mapStatus(raw.status),
    destinationLast4: digits.length >= 4 ? digits.slice(-4) : undefined,
    statementDescriptor: strOrUndefined(raw.description),
    gateway: 'stark-bank',
    metadata: tagsMetadata(raw.tags),
    createdAt: toIsoDatetime(raw.created),
    updatedAt: toIsoDatetime(raw.updated),
    raw,
  }
}
