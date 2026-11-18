import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface NuvemFiscalDespesaItem {
  id_item: number
  id_conta: number
  descricao: string
  valor_total: number
  valor_imposto: number
  [key: string]: unknown
}

export interface NuvemFiscalDespesa {
  id_despesa: number
  descricao: string
  id_fornecedor: number
  valor_total: number
  valor_impostos: number
  moeda: string
  data_emissao: string
  itens: NuvemFiscalDespesaItem[]
  [key: string]: unknown
}

function mapLineitem(row: NuvemFiscalDespesaItem): Lineitem {
  return {
    id: String(row.id_item),
    accountId: row.id_conta ? String(row.id_conta) : undefined,
    itemDescription: row.descricao || undefined,
    totalAmount: row.valor_total,
    taxAmount: row.valor_imposto || undefined,
  }
}

export function transformExpense(raw: NuvemFiscalDespesa): Expense {
  return {
    id: String(raw.id_despesa),
    name: raw.descricao || undefined,
    contactId: raw.id_fornecedor ? String(raw.id_fornecedor) : undefined,
    currency: raw.moeda || undefined,
    taxAmount: raw.valor_impostos || undefined,
    totalAmount: raw.valor_total,
    lineItems: (raw.itens ?? []).map(mapLineitem),
    postedAt: raw.data_emissao ? new Date(raw.data_emissao) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    id_fornecedor: expense.contactId ? Number(expense.contactId) : undefined,
    descricao: expense.name,
    moeda: expense.currency,
    data_emissao: toCalendarDate(expense.postedAt),
    itens: expense.lineItems?.map((li) => ({
      id_conta: li.accountId ? Number(li.accountId) : undefined,
      descricao: li.itemDescription,
      valor_total: li.totalAmount,
    })),
  }
}
