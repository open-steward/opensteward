import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawMyfatoorahPaymentStatus {
  [k: string]: unknown
}

function mapStatus(s: string | undefined | null): InvoiceStatus {
  const v = typeof s === 'string' ? s.toLowerCase() : ''
  if (v === 'paid' || v === 'success' || v === 'completed') return 'paid'
  if (v === 'expired' || v === 'cancelled' || v === 'canceled' || v === 'voided') return 'void'
  if (v === 'pending' || v === 'in progress' || v === 'inprogress') return 'open'
  return 'open'
}

export function transformInvoice(raw: RawMyfatoorahPaymentStatus): Invoice {
  const currency = pickCurrency(
    (raw['PaidCurrency'] as string | undefined) ??
    (raw['DisplayCurrency'] as string | undefined) ??
    (raw['CurrencyIso'] as string | undefined),
    'KWD',
  )

  const total = toMinorUnits(raw['InvoiceValue'])

  return {
    id: String(raw['InvoiceId'] ?? ''),
    externalId: String(raw['InvoiceId'] ?? ''),
    number: raw['InvoiceReference'] != null ? String(raw['InvoiceReference']) : undefined,
    customerId: raw['CustomerReference'] != null ? String(raw['CustomerReference']) : undefined,
    status: mapStatus(raw['InvoiceStatus'] as string | undefined),
    currency,
    total,
    amountDue: toMinorUnits(raw['DueValue'] ?? raw['InvoiceValue']),
    amountPaid: mapStatus(raw['InvoiceStatus'] as string | undefined) === 'paid' ? total : 0,
    dueDate: raw['ExpiryDate'] != null ? String(raw['ExpiryDate']) : undefined,
    gateway: 'myfatoorah',
    metadata: strMap(raw['UserDefinedField'] != null ? { UserDefinedField: raw['UserDefinedField'] } : {}),
    createdAt: raw['CreatedDate'] != null ? String(raw['CreatedDate']) : undefined,
    raw,
  }
}
