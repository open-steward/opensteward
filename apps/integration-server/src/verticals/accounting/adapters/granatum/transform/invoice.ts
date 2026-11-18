/**
 * Granatum lançamento → canonical Invoice (receivable / income entries).
 *
 * In Granatum a lançamento represents a generic financial entry. Positive
 * `valor` values are income (receita), negative values are expenses (despesa).
 * This transform covers the receivable side (valor >= 0).
 *
 * Status mapping:
 *   data_pagamento set           → PAID
 *   data_vencimento < today      → OVERDUE
 *   otherwise                    → AUTHORIZED
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import { parseDecimal, toMinorUnits, toCalendarDate } from '../../shared/transform'

export interface GranatumLancamento {
  id: number
  descricao: string
  valor: number | string
  data_vencimento: string | null
  data_pagamento: string | null
  data_competencia: string | null
  documento: string | null
  pessoa_id: number | null
  conta_id: number | null
  categoria_id: number | null
  centro_custo_lucro_id: number | null
  forma_pagamento_id: number | null
  observacao: string | null
  modified: string | null
  [key: string]: unknown
}

function mapStatus(raw: GranatumLancamento): InvoiceStatus {
  if (raw.data_pagamento) return 'PAID'
  if (raw.data_vencimento) {
    const due = new Date(raw.data_vencimento)
    if (!isNaN(due.getTime()) && due < new Date()) return 'OVERDUE'
  }
  return 'AUTHORIZED'
}

export function transformInvoice(raw: GranatumLancamento): Invoice {
  // Granatum returns amounts as decimal BRL (e.g. 150.00).
  // Canonical Amount is integer minor units (centavos): multiply × 100.
  const amount = parseDecimal(raw.valor)
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.documento || undefined,
    contactId: raw.pessoa_id ? String(raw.pessoa_id) : undefined,
    totalAmount: amount !== undefined ? Math.abs(toMinorUnits(amount) ?? 0) : undefined,
    paidAt: raw.data_pagamento ? new Date(raw.data_pagamento) : undefined,
    postedAt: raw.data_competencia ? new Date(raw.data_competencia) : undefined,
    dueAt: raw.data_vencimento ? new Date(raw.data_vencimento) : undefined,
    notes: raw.observacao || undefined,
    updatedAt: raw.modified ? new Date(raw.modified) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical Invoice → Granatum lançamento body (create/update).
 *
 * Canonical totalAmount is in integer minor units (centavos); Granatum
 * expects a decimal BRL string (e.g. "150.00"), so divide by 100.
 */
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  const valorDecimal =
    invoice.totalAmount != null
      ? (invoice.totalAmount / 100).toFixed(2)
      : undefined
  return {
    descricao: invoice.notes ?? invoice.invoiceNumber ?? '',
    valor: valorDecimal,
    data_vencimento: toCalendarDate(invoice.dueAt),
    data_competencia: toCalendarDate(invoice.postedAt),
    documento: invoice.invoiceNumber,
    pessoa_id: invoice.contactId,
    observacao: invoice.notes,
  }
}
