import type { Charge, ChargeStatus } from '../../../schema/charge'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawCybersourcePayment {
  id?: string
  status?: string
  reconciliationId?: string
  submitTimeUtc?: string
  clientReferenceInformation?: { code?: string }
  orderInformation?: {
    amountDetails?: { totalAmount?: string; currency?: string }
    billTo?: { firstName?: string; lastName?: string; email?: string }
  }
  errorInformation?: { reason?: string; message?: string }
  [k: string]: unknown
}

function mapStatus(raw: RawCybersourcePayment): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'AUTHORIZED':
    case 'PARTIAL_AUTHORIZED':
      return 'pending'
    case 'AUTHORIZED_PENDING_REVIEW':
    case 'PENDING_REVIEW':
    case 'PENDING':
      return 'pending'
    case 'TRANSMITTED':
    case 'COMPLETED':
    case 'SETTLED':
      return 'succeeded'
    case 'DECLINED':
    case 'AUTHORIZED_RISK_DECLINED':
    case 'FAILED':
    case 'INVALID_REQUEST':
      return 'failed'
    case 'VOIDED':
    case 'REVERSED':
      return 'cancelled'
    case 'REFUNDED':
      return 'refunded'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawCybersourcePayment): Charge {
  const bill = raw.orderInformation?.billTo
  const name = [bill?.firstName, bill?.lastName].filter(Boolean).join(' ').trim()
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: decimalToMinor(raw.orderInformation?.amountDetails?.totalAmount),
    currency: pickCurrency(raw.orderInformation?.amountDetails?.currency),
    status: mapStatus(raw),
    receiptEmail: bill?.email,
    description: name || raw.clientReferenceInformation?.code,
    failureCode: raw.errorInformation?.reason,
    failureMessage: raw.errorInformation?.message,
    gateway: 'cybersource',
    metadata: strMap({
      clientReferenceCode: raw.clientReferenceInformation?.code,
      reconciliationId: raw.reconciliationId,
    }),
    createdAt: raw.submitTimeUtc,
    raw,
  }
}
