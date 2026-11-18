/**
 * vhsys expense (contas a pagar — despesas) transform.
 *
 * vhsys does not have a dedicated expense endpoint distinct from accounts
 * payable. Expenses are modelled as payable entries ("contas_pagar") of
 * type "despesa". This transform maps those records to the canonical Expense.
 *
 * Endpoints (reuses contas_pagar with despesa filter):
 *   GET /contas_pagar?tipo=despesa   — list expenses
 *   GET /contas_pagar/{id}           — get expense
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Expense } from '../../../schema/expense'
import { toMinorUnits } from '../../shared/transform'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface VhsysContaPagarDespesa {
  id_conta_pagar: string | number
  id_fornecedor?: string | number
  descricao_conta?: string
  valor_conta?: number | string
  data_lancamento?: string
  data_vencimento?: string
  data_pagamento?: string
  moeda?: string
  forma_pagamento?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformExpense(raw: VhsysContaPagarDespesa): Expense {
  const postedIso = toIsoDatetime(raw.data_lancamento)
  return {
    id: String(raw.id_conta_pagar),
    name: raw.descricao_conta || undefined,
    contactId: raw.id_fornecedor !== undefined ? `supp_${raw.id_fornecedor}` : undefined,
    currency: raw.moeda || 'BRL',
    paymentMethod: raw.forma_pagamento || undefined,
    totalAmount: toMinorUnits(raw.valor_conta),
    postedAt: postedIso ? new Date(postedIso) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
