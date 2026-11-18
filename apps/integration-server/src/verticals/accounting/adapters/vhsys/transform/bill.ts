/**
 * vhsys bill (contas a pagar) transform.
 *
 * vhsys exposes accounts-payable records under the "contas_pagar" resource.
 * These represent supplier bills / purchase invoices.
 *
 * Endpoints:
 *   GET /contas_pagar        — list bills
 *   GET /contas_pagar/{id}   — get bill
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Bill, BillStatus } from '../../../schema/bill'
import { toMinorUnits } from '../../shared/transform'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface VhsysContaPagar {
  id_conta_pagar: string | number
  id_fornecedor?: string | number
  descricao_conta?: string
  valor_conta?: number | string
  valor_pago?: number | string
  data_vencimento?: string
  data_pagamento?: string
  data_lancamento?: string
  situacao?: string        // 'A' = open, 'P' = paid, 'C' = cancelled/voided
  numero_documento?: string
  moeda?: string
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(raw: VhsysContaPagar): BillStatus {
  const s = (raw.situacao ?? '').toUpperCase()
  if (s === 'C') return 'VOIDED'
  if (s === 'P') return 'PAID'
  if (s === 'A') {
    const total = Number(raw.valor_conta ?? 0)
    const paid = Number(raw.valor_pago ?? 0)
    if (paid > 0 && paid < total) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformBill(raw: VhsysContaPagar): Bill {
  const total = toMinorUnits(raw.valor_conta)
  const paid = toMinorUnits(raw.valor_pago)
  const balance = total !== undefined && paid !== undefined ? total - paid : undefined
  const postedIso = toIsoDatetime(raw.data_lancamento)
  const dueIso = toIsoDatetime(raw.data_vencimento)
  const paidIso = toIsoDatetime(raw.data_pagamento)

  return {
    id: String(raw.id_conta_pagar),
    status: mapStatus(raw),
    billNumber: raw.numero_documento || undefined,
    contactId: raw.id_fornecedor !== undefined ? `supp_${raw.id_fornecedor}` : undefined,
    currency: raw.moeda || 'BRL',
    totalAmount: total,
    paidAmount: paid,
    balanceAmount: balance,
    notes: raw.descricao_conta || undefined,
    postedAt: postedIso ? new Date(postedIso) : undefined,
    dueAt: dueIso ? new Date(dueIso) : undefined,
    paidAt: paidIso ? new Date(paidIso) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
