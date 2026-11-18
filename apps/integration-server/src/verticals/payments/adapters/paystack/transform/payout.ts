import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap } from './shared'

/**
 * Paystack models payouts as Transfers (money sent from your Paystack balance
 * to a bank account or mobile money wallet).
 * Endpoint: GET /transfer  — GET /transfer/:id_or_code
 * Docs: https://paystack.com/docs/api/transfer/
 */
export interface RawPaystackTransfer {
  id?: number
  transfer_code?: string
  reference?: string
  amount?: number
  currency?: string
  status?: string
  reason?: string
  source?: string
  failures?: unknown
  transferred_at?: string | null
  createdAt?: string
  updatedAt?: string
  recipient?: number | { account_number?: string; details?: { account_number?: string } } | null
  [k: string]: unknown
}

function mapStatus(raw: RawPaystackTransfer): PayoutStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'success':
      return 'paid'
    case 'pending':
    case 'queued':
      return 'pending'
    case 'otp':
    case 'processing':
      return 'in_transit'
    case 'failed':
      return 'failed'
    case 'reversed':
      return 'cancelled'
    default:
      return 'pending'
  }
}

function extractLast4(
  recipient: RawPaystackTransfer['recipient'],
): string | undefined {
  if (!recipient || typeof recipient !== 'object') return undefined
  const acct =
    (recipient as { account_number?: string }).account_number ??
    (recipient as { details?: { account_number?: string } }).details?.account_number
  return acct ? acct.slice(-4) : undefined
}

export function transformPayout(raw: RawPaystackTransfer): Payout {
  return {
    id: String(raw.id ?? raw.transfer_code ?? ''),
    externalId: String(raw.transfer_code ?? raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    arrivalDate: raw.transferred_at ?? undefined,
    destinationLast4: extractLast4(raw.recipient),
    statementDescriptor: raw.reason,
    gateway: 'paystack',
    metadata: strMap({ source: raw.source, reference: raw.reference }),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    raw,
  }
}
