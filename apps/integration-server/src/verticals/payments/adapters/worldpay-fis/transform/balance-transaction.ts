/**
 * Maps a Worldpay Access Statements API item
 * (GET /accounts/statements/) to the canonical BalanceTransaction type.
 *
 * Endpoint: GET https://try.access.worldpay.com/accounts/statements/
 * Response envelope: { accountStatementItems: RawWorldpayStatementItem[] }
 */

import type { BalanceTransaction, BalanceTransactionType } from '../../../schema/balance-transaction'
import { pickCurrency, strMap } from './shared'

export interface RawWorldpayStatementItem {
  statementItemId?: string
  transactionReference?: string
  transferType?: string
  amount?: number
  currency?: string
  timestamp?: string
  fundingType?: string
  cleared?: string
  description?: string
  statementNumber?: string
  narrative?: string
  countryCode?: string
  originalCurrency?: string
  originalAmount?: number
  rate?: number
  balance?: number
  [k: string]: unknown
}

export interface RawWorldpayStatementsResponse {
  accountNumber?: string
  currency?: string
  pageNumber?: number
  pageSize?: number
  pageCount?: number
  totalNumberOfRecords?: number
  accountStatementItems?: RawWorldpayStatementItem[]
  [k: string]: unknown
}

function mapType(transferType: string | undefined): BalanceTransactionType {
  switch ((transferType ?? '').toUpperCase()) {
    case 'PAYOUT':
    case 'PAYOUT REVERSAL':
      return 'payout'
    case 'CHARGE':
    case 'PAYMENT':
      return 'charge'
    case 'REFUND':
      return 'refund'
    case 'DISPUTE':
    case 'CHARGEBACK':
      return 'dispute'
    case 'TRANSFER':
    case 'LIQUIDITY FUNDING':
    case 'ACCOUNT TRANSFER':
      return 'transfer'
    case 'FEE':
    case 'SERVICE CHARGE':
      return 'fee'
    case 'ADJUSTMENT':
      return 'adjustment'
    default:
      return 'other'
  }
}

export function transformBalanceTransaction(raw: RawWorldpayStatementItem): BalanceTransaction {
  const isDebit = (raw.fundingType ?? '').toLowerCase() === 'debit'
  const absAmount = raw.amount ?? 0
  const amount = isDebit ? -absAmount : absAmount

  return {
    id: String(raw.statementItemId ?? raw.transactionReference ?? ''),
    externalId: String(raw.statementItemId ?? raw.transactionReference ?? ''),
    type: mapType(raw.transferType),
    amount,
    currency: pickCurrency(raw.currency),
    net: amount,
    sourceId: raw.transactionReference,
    sourceType: (raw.transferType ?? '').toLowerCase() || undefined,
    description: raw.description ?? raw.narrative,
    gateway: 'worldpay-fis',
    metadata: strMap({
      statementNumber: raw.statementNumber,
      narrative: raw.narrative,
      countryCode: raw.countryCode,
      cleared: raw.cleared,
    }),
    createdAt: raw.timestamp,
    raw,
  }
}
