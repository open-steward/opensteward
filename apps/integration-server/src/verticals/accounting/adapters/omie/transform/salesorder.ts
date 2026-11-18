import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface OmieSalesOrderItem {
  codigo_item: number
  codigo_produto: string
  descricao: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  valor_imposto: number
  conta_contabil: string
  valor_desconto: number
  [key: string]: unknown
}

export interface OmieSalesOrder {
  codigo_pedido: number
  numero_pedido: string
  codigo_cliente: number
  moeda: string
  data_pedido: string
  status: string
  valor_total: number
  valor_imposto: number
  itens: OmieSalesOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  if (status === 'FATURADO' || status === 'CONCLUIDO') return 'COMPLETED'
  if (status === 'CANCELADO') return 'CANCELLED'
  if (status === 'RASCUNHO') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: OmieSalesOrderItem): Lineitem {
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

export function transformSalesOrder(raw: OmieSalesOrder): SalesOrder {
  return {
    id: String(raw.codigo_pedido),
    status: mapStatus(raw.status),
    contactId: raw.codigo_cliente ? String(raw.codigo_cliente) : undefined,
    currency: raw.moeda || undefined,
    totalAmount: raw.valor_total,
    lineItems: (raw.itens ?? []).map(mapLineitem),
    postedAt: raw.data_pedido ? new Date(raw.data_pedido) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    codigo_cliente: order.contactId ? Number(order.contactId) : undefined,
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
