/**
 * Tink SettlementAccountTransaction → canonical BalanceTransaction.
 *
 * Every settlement-account transaction moves the account balance
 * (`accountBalance`: "The balance of the account after the transaction was
 * made."). SettlementAccountTransactionType
 * (https://docs.tink.com/api#payment/settlement-accounts/list-transactions):
 *
 *   PAYIN            "Received payment which increases settlement account balance."  → charge
 *   REFUND           "Partial or full refund to the original payer of previously received funds." → refund
 *   SWEEP            "A scheduled payout to Merchant corporate account."             → payout
 *   TRANSFER         "A payout from the account."                                    → transfer
 *   REVERT           "A corrective transaction which reverses transaction made in error." → adjustment
 *   PAYMENT_REVERSAL "The reversal of a payment from the account. ..."               → adjustment
 *   MERCHANT_PAYIN   "Received payment from the merchant's payout account."          → adjustment
 *   WITHDRAWAL       "Payout to an end-user's bank account."                         → other
 *   EXTERNAL_PAYIN   "Received direct bank payment (outside Tink PIS)."             → other
 *   TRANSACTION_TYPE_UNSPECIFIED, anything else                                      → other
 *
 * sourceId points into the id spaces the adapter lists: a PAYIN is the charge
 * listCharges returns under the same id, a SWEEP the payout listPayouts
 * returns. Other types have no canonical record to point at.
 *
 * Tink documents no fee, net or available-on date, so those stay unset.
 */
import type {
  BalanceTransaction,
  BalanceTransactionType,
} from '../../../schema/balance-transaction'
import {
  amountToMinor,
  isoDate,
  requireId,
  stringMap,
  text,
  type RawTinkTransaction,
} from './shared'

export function mapTransactionType(type: unknown): BalanceTransactionType {
  switch (type) {
    case 'PAYIN':
      return 'charge'
    case 'REFUND':
      return 'refund'
    case 'SWEEP':
      return 'payout'
    case 'TRANSFER':
      return 'transfer'
    case 'REVERT':
    case 'PAYMENT_REVERSAL':
    case 'MERCHANT_PAYIN':
      return 'adjustment'
    default:
      return 'other'
  }
}

const SOURCE_TYPE: Record<string, string> = { PAYIN: 'charge', SWEEP: 'payout' }

export function transformBalanceTransaction(raw: RawTinkTransaction): BalanceTransaction {
  const id = requireId(raw.id, 'transaction')
  const { amount, currency } = amountToMinor(raw.amount, `transaction ${id}`)
  const sourceType = typeof raw.type === 'string' ? SOURCE_TYPE[raw.type] : undefined
  return {
    id,
    externalId: id,
    type: mapTransactionType(raw.type),
    amount,
    currency,
    ...(sourceType ? { sourceId: id, sourceType } : {}),
    description: text(raw.reference),
    gateway: 'tink',
    metadata: stringMap(raw.metadata),
    createdAt: isoDate(raw.timestamp),
    raw,
  }
}
