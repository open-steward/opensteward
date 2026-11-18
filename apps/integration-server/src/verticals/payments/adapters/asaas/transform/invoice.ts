/**
 * Asaas NFS-e Invoice ↔ canonical Invoice.
 *
 * Asaas `GET /invoices` returns Brazilian NFS-e (Nota Fiscal de Serviço
 * Eletrônica) fiscal notes — electronic service-tax documents, not payment
 * billing invoices. Each fiscal note is linked to a Payment via the `payment`
 * field. Despite the domain mismatch, we map the available fields to the
 * canonical Invoice schema so that integrators can retrieve them.
 *
 * Status mapping:
 *   SCHEDULED / SYNCHRONIZED → open
 *   AUTHORIZED              → paid
 *   PROCESSING_CANCELLATION → void (in progress)
 *   CANCELED                → void
 *   CANCELLATION_DENIED     → open (denial means it's still active)
 *   ERROR                   → uncollectible
 *
 * Money: `value` is decimal reais → integer centavos. Currency is always BRL.
 *
 * Refs:
 *   https://docs.asaas.com/reference/list-invoices
 *   https://docs.asaas.com/reference/issue-an-invoice
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { ASAAS_CURRENCY, strMap, toIsoDatetime, toMinorUnits } from './shared'

export interface RawAsaasInvoice {
  object?: string
  id?: string
  /** Linked Asaas payment id. */
  payment?: string
  customer?: string
  type?: string
  status?: string
  statusDescription?: string
  serviceDescription?: string
  observations?: string
  externalReference?: string
  /** Invoice amount in reais. */
  value?: number
  deductions?: number
  effectiveDate?: string
  municipalServiceId?: string
  municipalServiceCode?: string
  municipalServiceName?: string
  /** URL to the fiscal invoice PDF. */
  pdfUrl?: string
  /** URL to the fiscal invoice XML. */
  xmlUrl?: string
  rpsSerie?: string
  rpsNumber?: string
  /** Numeric fiscal note number as issued by the municipality. */
  number?: string
  validationCode?: string
  estimatedTaxesDescription?: string
  taxes?: {
    retainIss?: boolean
    iss?: number
    cofins?: number
    csll?: number
    inss?: number
    ir?: number
    pis?: number
  }
  [k: string]: unknown
}

/** Map Asaas NFS-e status → canonical InvoiceStatus. */
function mapStatus(raw: RawAsaasInvoice): InvoiceStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'AUTHORIZED':
      return 'paid'
    case 'CANCELED':
    case 'PROCESSING_CANCELLATION':
      return 'void'
    case 'ERROR':
      return 'uncollectible'
    case 'SCHEDULED':
    case 'SYNCHRONIZED':
    case 'CANCELLATION_DENIED':
    default:
      return 'open'
  }
}

export function transformInvoice(raw: RawAsaasInvoice): Invoice {
  const total = toMinorUnits(raw.value) ?? 0
  const status = mapStatus(raw)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    number: raw.number ?? raw.rpsNumber ?? undefined,
    customerId: raw.customer ?? undefined,
    subscriptionId: undefined,
    status,
    currency: ASAAS_CURRENCY,
    total,
    amountDue: status === 'paid' ? 0 : total,
    amountPaid: status === 'paid' ? total : 0,
    amountRemaining: status === 'paid' ? 0 : total,
    dueDate: toIsoDatetime(raw.effectiveDate),
    paidAt: status === 'paid' ? toIsoDatetime(raw.effectiveDate) : undefined,
    hostedInvoiceUrl: raw.pdfUrl ?? undefined,
    invoicePdfUrl: raw.pdfUrl ?? undefined,
    gateway: 'asaas',
    metadata: strMap({
      paymentId: raw.payment,
      serviceDescription: raw.serviceDescription,
      municipalServiceName: raw.municipalServiceName,
      externalReference: raw.externalReference,
      xmlUrl: raw.xmlUrl,
    }),
    createdAt: toIsoDatetime(raw.effectiveDate),
    updatedAt: toIsoDatetime(raw.effectiveDate),
    raw,
  }
}
