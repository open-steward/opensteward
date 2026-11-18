/**
 * eGestor Pagamentos (accounts payable / disbursements) → canonical Expense
 * transform.
 *
 * eGestor does not have a dedicated "expenses" endpoint. Pagamentos
 * (GET /api/v1/pagamentos) are the closest equivalent for outgoing payments /
 * expense disbursements. The EgestorAdapter maps pagamentos to both Bill
 * (via transform/bill.ts for purchase-linked bills) and Expense (for
 * standalone disbursements).
 *
 * situacao: 10=open, 30=paid
 */
import type { Expense } from '../../../schema/expense'

export interface EgestorPagamentoExpense {
  codigo: number
  codPlanoContas?: number
  codFormaPgto?: number
  numDoc?: string
  descricao?: string
  valor?: number
  taxa?: number
  dtVenc?: string
  dtPgto?: string
  dtCad?: string
  dtComp?: string
  /** 10=open, 30=paid */
  situacao?: number
  codContato?: number
  nomeContato?: string
  codDisponivel?: number
  origem?: string
  codModulo?: number
  obs?: string
  tags?: string[]
  [key: string]: unknown
}

export function transformExpense(raw: EgestorPagamentoExpense): Expense {
  return {
    id: String(raw.codigo),
    name: raw.descricao || undefined,
    contactId: raw.codContato ? String(raw.codContato) : undefined,
    totalAmount: raw.valor != null ? Math.round(raw.valor * 100) : undefined,
    // notes is not a field on Expense schema; obs is stored in metadata
    postedAt: raw.dtPgto ? new Date(raw.dtPgto) : raw.dtVenc ? new Date(raw.dtVenc) : undefined,
    createdAt: raw.dtCad ? new Date(raw.dtCad) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
