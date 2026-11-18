import type {
  CreditMemo,
  CreditMemoApplication,
  CreditMemoStatus,
} from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

/**
 * inFakt corrective (credit-note) invoice.
 *
 * Endpoint: GET /api/v3/corrective_invoices.json
 *           GET /api/v3/corrective_invoices/{uuid}.json
 *
 * In Polish tax law a "faktura korygująca" (corrective invoice) is the
 * equivalent of a credit memo — it corrects or reverses a prior VAT invoice.
 * The response shape is a superset of the standard invoice object.
 *
 * Amounts are in groszy (1 PLN = 100 groszy).
 * Identifier: uuid (string).
 */

export interface InfaktCorrectiveInvoiceService {
  name: string
  tax_symbol: string | null
  unit: string | null
  quantity: number | null
  unit_net_price: number | null
  net_price: number | null
  gross_price: number | null
  tax_price: number | null
  discount: number | null
  [key: string]: unknown
}

export interface InfaktCorrectiveInvoice {
  uuid: string
  number: string
  status: string
  currency: string
  invoice_date: string | null
  payment_date: string | null
  paid_date: string | null
  net_price: number | null
  tax_price: number | null
  gross_price: number | null
  left_to_pay: number | null
  client_id: number | null
  notes: string | null
  payment_method: string | null
  services: InfaktCorrectiveInvoiceService[]
  /** Number of the original VAT invoice being corrected */
  corrected_invoice_number: string | null
  /** Date of the original VAT invoice */
  corrected_invoice_date: string | null
  /**
   * UUID of the original VAT invoice ("UUID faktury korygowanej"), the same
   * `uuid` the Invoice resource reports. Documented as read-only and returned
   * by show (GET /corrective_invoices/{uuid}.json), so a list row may lack it.
   */
  corrected_invoice_uuid?: string | null
  /** Reason for correction: "mistake" | "other" */
  correction_reason: string | null
  /** Whether the signed document was received */
  confirmation: boolean | null
  confirmation_date: string | null
  created_at: string | null
  [key: string]: unknown
}

function mapStatus(raw: InfaktCorrectiveInvoice): CreditMemoStatus {
  switch (raw.status) {
    case 'paid':
      return 'PAID'
    case 'sent':
    case 'printed':
      return 'AUTHORIZED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'AUTHORIZED'
  }
}

function mapLineitem(svc: InfaktCorrectiveInvoiceService): Lineitem {
  return {
    itemName: svc.name || undefined,
    itemDescription: svc.name || undefined,
    unitAmount: svc.unit_net_price ?? undefined,
    unitQuantity: svc.quantity != null ? Math.round(svc.quantity) : undefined,
    totalAmount: svc.gross_price ?? undefined,
    taxAmount: svc.tax_price ?? undefined,
    discountAmount: svc.discount ?? undefined,
  }
}

/**
 * The invoice a corrective invoice corrects. inFakt's published API collection
 * documents `corrected_invoice_number` and the read-only (show only)
 * `corrected_invoice_uuid`. `corrected_invoice_date` is that invoice's own
 * date, not when the correction was applied, so it is not `appliedAt`.
 */
function mapAppliedTo(raw: InfaktCorrectiveInvoice): CreditMemoApplication[] | undefined {
  const invoiceId = raw.corrected_invoice_uuid || undefined
  const invoiceNumber = raw.corrected_invoice_number || undefined
  if (invoiceId === undefined && invoiceNumber === undefined) return undefined
  return [{ invoiceId, invoiceNumber }]
}

export function transformCreditMemo(raw: InfaktCorrectiveInvoice): CreditMemo {
  const balanceAmount = raw.left_to_pay ?? undefined
  const totalAmount = raw.gross_price ?? undefined
  const paidAmount =
    totalAmount !== undefined && balanceAmount !== undefined
      ? totalAmount - balanceAmount
      : undefined

  return {
    id: raw.uuid,
    status: mapStatus(raw),
    creditmemoNumber: raw.number || undefined,
    contactId: raw.client_id != null ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount,
    taxAmount: raw.tax_price ?? undefined,
    balanceAmount,
    paidAmount,
    notes: raw.notes || undefined,
    lineItems: (raw.services ?? []).map(mapLineitem),
    appliedTo: mapAppliedTo(raw),
    postedAt: toIsoDatetime(raw.invoice_date)
      ? new Date(toIsoDatetime(raw.invoice_date)!)
      : undefined,
    dueAt: toIsoDatetime(raw.payment_date) ? new Date(toIsoDatetime(raw.payment_date)!) : undefined,
    paidAt: toIsoDatetime(raw.paid_date) ? new Date(toIsoDatetime(raw.paid_date)!) : undefined,
    createdAt: toIsoDatetime(raw.created_at) ? new Date(toIsoDatetime(raw.created_at)!) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
