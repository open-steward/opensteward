import type { Charge, ChargeStatus } from '../../../schema/charge'
import { toIsoDatetime } from '@opensteward/shared'
import {
  flattenMetaData,
  pickCurrency,
  strMap,
  toMinorUnits,
  type RawTransactionMetaData,
} from './shared'

/**
 * BlueSnap card transaction (Payment API). Amounts are decimal major units.
 * `cardTransactionType` is one of AUTH_ONLY / AUTH_CAPTURE / CAPTURE /
 * REFUND. `processingInfo.processingStatus` carries the lifecycle state.
 *
 * Docs: https://developers.bluesnap.com/v8976-JSON/reference/retrieve
 */
export interface RawBluesnapProcessingInfo {
  processingStatus?: string
  cvvResponseCode?: string
  authorizationCode?: string
  avsResponseCodeZip?: string
}

export interface RawBluesnapRefundEntry {
  amount?: number | string
  currency?: string
  refundTransactionId?: string | number
  date?: string
}

export interface RawBluesnapTransaction {
  transactionId?: string | number
  amount?: number | string
  currency?: string
  softDescriptor?: string
  cardTransactionType?: string
  vaultedShopperId?: string | number
  merchantTransactionId?: string
  transactionApprovalDate?: string
  transactionApprovalTime?: string
  refundedAmount?: number | string
  processingInfo?: RawBluesnapProcessingInfo
  cardHolderInfo?: { email?: string; firstName?: string; lastName?: string }
  refunds?: { refund?: RawBluesnapRefundEntry[] }
  transactionMetaData?: { metaData?: RawTransactionMetaData[] } | RawTransactionMetaData[]
  [k: string]: unknown
}

function mapStatus(raw: RawBluesnapTransaction): ChargeStatus {
  const status = (raw.processingInfo?.processingStatus ?? '').toUpperCase()
  switch (status) {
    case 'SUCCESS':
      return 'succeeded'
    case 'PENDING':
      return 'pending'
    case 'FAIL':
      return 'failed'
    case 'REFUNDED':
      return 'refunded'
    case 'CHARGEBACK':
      return 'disputed'
    default:
      // No processingStatus on a freshly-created AUTH/CAPTURE means the call
      // returned the resource synchronously — treat as succeeded.
      return raw.transactionId ? 'succeeded' : 'pending'
  }
}

function metaItems(raw: RawBluesnapTransaction): RawTransactionMetaData[] {
  const md = raw.transactionMetaData
  if (Array.isArray(md)) return md
  return md?.metaData ?? []
}

const BLUESNAP_MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

/**
 * BlueSnap returns `transactionApprovalDate` as `DD-MMM-YY` (e.g. `15-Apr-26`),
 * which `new Date()` / toIsoDatetime cannot parse — so timestamps were silently
 * dropped on every approved transaction. Parse it explicitly (treating the
 * clock as UTC; the raw values are preserved on the canonical object for any
 * downstream tz correction). Never throws — returns undefined on a bad shape.
 */
function bluesnapApprovalToIso(date?: string, time?: string): string | undefined {
  if (!date) return undefined
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{2,4})$/.exec(date.trim())
  if (!m) return toIsoDatetime(date)
  const mon = BLUESNAP_MONTHS[m[2].toLowerCase()]
  if (mon === undefined) return undefined
  const day = Number(m[1])
  let year = Number(m[3])
  if (year < 100) year += 2000
  const [hh = '0', mm = '0', ss = '0'] = (time ?? '').split(':')
  const d = new Date(Date.UTC(year, mon, day, Number(hh) || 0, Number(mm) || 0, Number(ss) || 0))
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function transformCharge(raw: RawBluesnapTransaction): Charge {
  const id = String(raw.transactionId ?? raw.merchantTransactionId ?? '')
  const refundedAmount = toMinorUnits(raw.refundedAmount)
  const capturedType = (raw.cardTransactionType ?? '').toUpperCase()
  const captured = capturedType === 'AUTH_CAPTURE' || capturedType === 'CAPTURE'
  const approvalIso = bluesnapApprovalToIso(raw.transactionApprovalDate, raw.transactionApprovalTime)

  return {
    id,
    externalId: id,
    amount: toMinorUnits(raw.amount),
    currency: pickCurrency(raw.currency),
    amountRefunded: refundedAmount || undefined,
    status: mapStatus(raw),
    captured,
    customerId: raw.vaultedShopperId != null ? String(raw.vaultedShopperId) : undefined,
    statementDescriptor: raw.softDescriptor,
    receiptEmail: raw.cardHolderInfo?.email,
    gateway: 'bluesnap',
    metadata: {
      ...flattenMetaData(metaItems(raw)),
      ...strMap({
        cardTransactionType: raw.cardTransactionType,
        authorizationCode: raw.processingInfo?.authorizationCode,
        cvvResponseCode: raw.processingInfo?.cvvResponseCode,
      }),
    },
    createdAt: approvalIso,
    updatedAt: approvalIso,
    raw,
  }
}
