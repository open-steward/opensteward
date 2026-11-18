import { toCalendarDate } from '../../shared/transform'
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface OmieExpenseItem {
  codigo_item: number
  conta_contabil: string
  descricao: string
  valor_total: number
  valor_imposto: number
  [key: string]: unknown
}

export interface OmieExpense {
  codigo_lancamento: number
  descricao: string
  codigo_fornecedor: number
  valor_total: number
  valor_imposto: number
  moeda: string
  data_emissao: string
  itens: OmieExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(row: OmieExpenseItem): Lineitem {
  return {
    id: String(row.codigo_item),
    accountId: row.conta_contabil || undefined,
    itemDescription: row.descricao || undefined,
    totalAmount: row.valor_total,
    taxAmount: row.valor_imposto || undefined,
  }
}

export function transformExpense(raw: OmieExpense): Expense {
  return {
    id: String(raw.codigo_lancamento),
    name: raw.descricao || undefined,
    contactId: raw.codigo_fornecedor ? String(raw.codigo_fornecedor) : undefined,
    currency: raw.moeda || undefined,
    taxAmount: raw.valor_imposto || undefined,
    totalAmount: raw.valor_total,
    lineItems: (raw.itens ?? []).map(mapLineitem),
    postedAt: raw.data_emissao ? new Date(raw.data_emissao) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformExpense(expense: Partial<Expense>): Record<string, unknown> {
  return {
    codigo_fornecedor: expense.contactId ? Number(expense.contactId) : undefined,
    descricao: expense.name,
    moeda: expense.currency,
    data_emissao: toCalendarDate(expense.postedAt),
    itens: expense.lineItems?.map((li) => ({
      conta_contabil: li.accountId,
      descricao: li.itemDescription,
      valor_total: li.totalAmount,
    })),
  }
}
