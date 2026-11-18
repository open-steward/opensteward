/**
 * Opn Payments (Omise) Payout transform.
 *
 * Opn Payments calls payouts "transfers" (funds from merchant account to a
 * bank recipient). The canonical Payout maps directly from GET /transfers and
 * GET /transfers/{id}.
 *
 * Docs: https://docs.omise.co/transfers-api
 *
 * Key response fields:
 *   id, amount, currency, paid (bool), sent (bool), sendable (bool),
 *   bank_account.last_digits, failure_code, failure_message,
 *   paid_at, sent_at, created_at
 */

import type { Payout, PayoutStatus } from '../../../schema/payout'
import { pickCurrency, strMap, safeInt } from './shared'

export interface RawOpnTransfer {
  [k: string]: unknown
}

function mapStatus(raw: RawOpnTransfer): PayoutStatus {
  if (raw['paid'] === true) return 'paid'
  if (raw['sent'] === true) return 'in_transit'
  if (raw['failure_code'] != null) return 'failed'
  return 'pending'
}

export function transformPayout(raw: RawOpnTransfer): Payout {
  const id = String(raw['id'] ?? '')
  const bankAccount = raw['bank_account'] as Record<string, unknown> | undefined

  return {
    id,
    externalId: id,
    amount: safeInt(raw['amount']),
    currency: pickCurrency(raw['currency'] as string | undefined, 'THB'),
    status: mapStatus(raw),
    method: 'standard',
    arrivalDate: raw['paid_at'] != null
      ? String(raw['paid_at'])
      : raw['sent_at'] != null
        ? String(raw['sent_at'])
        : undefined,
    destinationLast4: bankAccount?.['last_digits'] != null
      ? String(bankAccount['last_digits'])
      : undefined,
    failureCode: raw['failure_code'] != null ? String(raw['failure_code']) : undefined,
    failureMessage: raw['failure_message'] != null ? String(raw['failure_message']) : undefined,
    gateway: 'opn-payments',
    metadata: strMap(raw['metadata'] ?? {}),
    createdAt: raw['created_at'] != null ? String(raw['created_at']) : undefined,
    raw,
  }
}
