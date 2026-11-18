/**
 * Asaas Transfer ↔ canonical Payout.
 *
 * Asaas "transfers" are withdrawals from an Asaas account to an external bank
 * account (TED) or Pix key, or to another Asaas sub-account. The canonical
 * Payout maps directly onto this concept.
 *
 * Status mapping:
 *   PENDING         → pending
 *   BANK_PROCESSING → in_transit
 *   DONE            → paid
 *   CANCELLED       → cancelled
 *   FAILED          → failed
 *
 * Money: `value` and `netValue` are decimal reais → integer centavos.
 * Currency is always BRL.
 *
 * Refs:
 *   https://docs.asaas.com/reference/list-transfers
 *   https://docs.asaas.com/reference/retrieve-a-single-transfer
 */
import type { Payout, PayoutStatus } from '../../../schema/payout'
import { ASAAS_CURRENCY, strMap, toIsoDatetime, toMinorUnits } from './shared'

export interface RawAsaasTransfer {
  object?: string
  id?: string
  dateCreated?: string
  /** ASAAS_ACCOUNT | BANK_ACCOUNT */
  type?: string
  /** Transfer value in reais. */
  value?: number
  /** Net value after fee deduction, in reais. */
  netValue?: number
  /** Fee charged for the transfer, in reais. */
  transferFee?: number
  /** PENDING | BANK_PROCESSING | DONE | CANCELLED | FAILED */
  status?: string
  /** Scheduled or actual settlement date. */
  effectiveDate?: string
  /** Pix or TED */
  operationType?: string
  failReason?: string
  bankAccount?: {
    bank?: { code?: string; ispb?: string; name?: string }
    accountName?: string
    ownerName?: string
    cpfCnpj?: string
    agency?: string
    account?: string
    accountDigit?: string
    bankAccountType?: string
    pixAddressKey?: string
  }
  transactionReceiptUrl?: string
  endToEndIdentifier?: string
  authorized?: boolean
  [k: string]: unknown
}

function mapStatus(raw: RawAsaasTransfer): PayoutStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'PENDING':
      return 'pending'
    case 'BANK_PROCESSING':
      return 'in_transit'
    case 'DONE':
      return 'paid'
    case 'CANCELLED':
      return 'cancelled'
    case 'FAILED':
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformPayout(raw: RawAsaasTransfer): Payout {
  const bankName = raw.bankAccount?.bank?.name ?? undefined
  const ownerAccount = raw.bankAccount?.account ?? undefined
  const last4 = ownerAccount ? ownerAccount.slice(-4) : undefined
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: toMinorUnits(raw.value) ?? 0,
    currency: ASAAS_CURRENCY,
    status: mapStatus(raw),
    method: 'standard',
    arrivalDate: toIsoDatetime(raw.effectiveDate),
    destinationLast4: last4,
    statementDescriptor: undefined,
    failureCode: undefined,
    failureMessage: raw.failReason ?? undefined,
    gateway: 'asaas',
    metadata: strMap({
      type: raw.type,
      operationType: raw.operationType,
      bankName,
      netValue: raw.netValue,
      transferFee: raw.transferFee,
      transactionReceiptUrl: raw.transactionReceiptUrl,
    }),
    createdAt: toIsoDatetime(raw.dateCreated),
    updatedAt: toIsoDatetime(raw.effectiveDate ?? raw.dateCreated),
    raw,
  }
}
