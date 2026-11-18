import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface NuvemFiscalNotaCreditoItem {
  id_item: number
  descricao: string
  preco_unitario: number
  quantidade: number
  valor_total: number
  valor_imposto: number
  desconto: number
  id_conta: number
  [key: string]: unknown
}

export interface NuvemFiscalNotaCredito {
  id_nota_credito: number
  numero_nota: string
  id_cliente: number
  nome_cliente: string
  data_emissao: string
  data_vencimento: string
  valor_total: number
  valor_impostos: number
  saldo: number
  moeda: string
  contabilizada: boolean
  cancelada: boolean
  valor_pago: number
  itens: NuvemFiscalNotaCreditoItem[]
  [key: string]: unknown
}

function mapStatus(cm: NuvemFiscalNotaCredito): CreditMemoStatus {
  if (cm.cancelada) return 'VOIDED'
  if (cm.contabilizada && cm.saldo === 0) return 'PAID'
  if (cm.contabilizada && cm.saldo > 0 && cm.saldo < Math.abs(cm.valor_total)) return 'PARTIALLY_PAID'
  if (cm.contabilizada) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: NuvemFiscalNotaCreditoItem): Lineitem {
  return {
    id: String(row.id_item),
    accountId: row.id_conta ? String(row.id_conta) : undefined,
    itemDescription: row.descricao || undefined,
    unitAmount: row.preco_unitario,
    unitQuantity: row.quantidade,
    totalAmount: row.valor_total,
    taxAmount: row.valor_imposto,
    discountAmount: row.desconto || undefined,
  }
}

export function transformCreditMemo(raw: NuvemFiscalNotaCredito): CreditMemo {
  return {
    id: String(raw.id_nota_credito),
    status: mapStatus(raw),
    creditmemoNumber: raw.numero_nota,
    contactId: raw.id_cliente ? String(raw.id_cliente) : undefined,
    currency: raw.moeda || undefined,
    totalAmount: raw.valor_total,
    taxAmount: raw.valor_impostos,
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
    id_cliente: cm.contactId ? Number(cm.contactId) : undefined,
    moeda: cm.currency,
    data_emissao: toCalendarDate(cm.postedAt),
    data_vencimento: toCalendarDate(cm.dueAt),
    itens: cm.lineItems?.map((li) => ({
      descricao: li.itemDescription,
      preco_unitario: li.unitAmount,
      quantidade: li.unitQuantity,
      id_conta: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
