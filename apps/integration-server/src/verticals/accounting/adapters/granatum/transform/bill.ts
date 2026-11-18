/**
 * Granatum lançamento → canonical Bill (payable / expense entries).
 *
 * Expense lançamentos are fetched using tipo "P" (payable) or "PA" (overdue
 * payable) filters. The `valor` field is positive in the raw payload when
 * fetched this way; we store it directly in totalAmount.
 *
 * Status mapping:
 *   data_pagamento set           → PAID
 *   data_vencimento < today      → OVERDUE
 *   otherwise                    → AUTHORIZED
 */
import type { Bill, BillStatus } from '../../../schema/bill'
import { parseDecimal, toMinorUnits } from '../../shared/transform'
import type { GranatumLancamento } from './invoice'

function mapStatus(raw: GranatumLancamento): BillStatus {
  if (raw.data_pagamento) return 'PAID'
  if (raw.data_vencimento) {
    const due = new Date(raw.data_vencimento)
    if (!isNaN(due.getTime()) && due < new Date()) return 'OVERDUE'
  }
  return 'AUTHORIZED'
}

export function transformBill(raw: GranatumLancamento): Bill {
  // Granatum returns amounts as decimal BRL (e.g. 150.00).
  // Canonical Amount is integer minor units (centavos): multiply × 100.
  const amount = parseDecimal(raw.valor)
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.documento || undefined,
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
