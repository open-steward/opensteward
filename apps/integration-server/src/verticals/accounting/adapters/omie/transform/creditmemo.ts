import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface OmieCreditMemoItem {
  codigo_item: number
  codigo_produto: string
  descricao: string
  valor_unitario: number
  quantidade: number
  valor_total: number
  valor_imposto: number
  conta_contabil: string
  valor_desconto: number
  [key: string]: unknown
}

export interface OmieCreditMemo {
  codigo_lancamento: number
  numero_nota: string
  codigo_cliente: number
  data_emissao: string
  data_vencimento: string
  valor_total: number
  valor_imposto: number
  saldo: number
  valor_pago: number
  moeda: string
  status: string
  cancelada: string
  itens: OmieCreditMemoItem[]
  [key: string]: unknown
}

function mapStatus(raw: OmieCreditMemo): CreditMemoStatus {
  if (raw.cancelada === 'S') return 'VOIDED'
  if (raw.status === 'PAGO' || raw.saldo === 0) return 'PAID'
  if (raw.valor_pago > 0 && raw.saldo > 0) return 'PARTIALLY_PAID'
  if (raw.status === 'AUTORIZADO') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: OmieCreditMemoItem): Lineitem {
  return {
    id: String(row.codigo_item),
    accountId: row.conta_contabil || undefined,
    itemId: row.codigo_produto || undefined,
    itemDescription: row.descricao || undefined,
    unitAmount: row.valor_unitario,
    unitQuantity: row.quantidade,
    totalAmount: row.valor_total,
    taxAmount: row.valor_imposto || undefined,
    discountAmount: row.valor_desconto || undefined,
  }
}

export function transformCreditMemo(raw: OmieCreditMemo): CreditMemo {
  return {
    id: String(raw.codigo_lancamento),
    status: mapStatus(raw),
    creditmemoNumber: raw.numero_nota || undefined,
    contactId: raw.codigo_cliente ? String(raw.codigo_cliente) : undefined,
    currency: raw.moeda || undefined,
    totalAmount: raw.valor_total,
    taxAmount: raw.valor_imposto,
    balanceAmount: raw.saldo,
    paidAmount: raw.valor_pago || undefined,
    lineItems: (raw.itens ?? []).map(mapLineitem),
    postedAt: raw.data_emissao ? new Date(raw.data_emissao) : undefined,
    dueAt: raw.data_vencimento ? new Date(raw.data_vencimento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  return {
    codigo_cliente: cm.contactId ? Number(cm.contactId) : undefined,
    moeda: cm.currency,
    data_emissao: toCalendarDate(cm.postedAt),
    data_vencimento: toCalendarDate(cm.dueAt),
    itens: cm.lineItems?.map((li) => ({
      codigo_produto: li.itemId,
      descricao: li.itemDescription,
      valor_unitario: li.unitAmount,
      quantidade: li.unitQuantity,
      conta_contabil: li.accountId,
    })),
  }
}
