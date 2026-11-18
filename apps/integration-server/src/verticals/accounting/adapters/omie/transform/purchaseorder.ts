import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface OmiePurchaseOrderItem {
  codigo_item: number
  codigo_produto: string
  descricao: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  valor_imposto: number
  conta_contabil: string
  [key: string]: unknown
}

export interface OmiePurchaseOrder {
  codigo_pedido: number
  numero_pedido: string
  codigo_fornecedor: number
  moeda: string
  data_pedido: string
  status: string
  valor_total: number
  valor_imposto: number
  itens: OmiePurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'RECEBIDO' || status === 'CONCLUIDO') return 'COMPLETED'
  if (status === 'CANCELADO') return 'CANCELLED'
  if (status === 'RASCUNHO') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: OmiePurchaseOrderItem): Lineitem {
  return {
    id: String(row.codigo_item),
    accountId: row.conta_contabil || undefined,
    itemId: row.codigo_produto || undefined,
    itemDescription: row.descricao || undefined,
    unitAmount: row.valor_unitario,
    unitQuantity: row.quantidade,
    totalAmount: row.valor_total,
    taxAmount: row.valor_imposto || undefined,
  }
}

export function transformPurchaseOrder(raw: OmiePurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.codigo_pedido),
    status: mapStatus(raw.status),
    contactId: raw.codigo_fornecedor ? String(raw.codigo_fornecedor) : undefined,
    currency: raw.moeda || undefined,
    totalAmount: raw.valor_total,
    lineItems: (raw.itens ?? []).map(mapLineitem),
    postedAt: raw.data_pedido ? new Date(raw.data_pedido) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    codigo_fornecedor: order.contactId ? Number(order.contactId) : undefined,
    moeda: order.currency,
    data_pedido: toCalendarDate(order.postedAt),
    itens: order.lineItems?.map((li) => ({
      codigo_produto: li.itemId,
      descricao: li.itemDescription,
      valor_unitario: li.unitAmount,
      quantidade: li.unitQuantity,
      conta_contabil: li.accountId,
    })),
  }
}
