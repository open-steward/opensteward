import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem, Address } from '../../../schema/shared'

export interface NuvemFiscalPedidoItem {
  id_item: number
  codigo_produto: string
  descricao: string
  preco_unitario: number
  quantidade: number
  valor_total: number
  valor_imposto: number
  id_conta: number
  desconto: number
  [key: string]: unknown
}

export interface NuvemFiscalPedido {
  id_pedido: number
  id_cliente: number
  nome_cliente: string
  moeda: string
  valor_total: number
  data_pedido: string
  status: string
  endereco_entrega: string
  cidade_entrega: string
  cep_entrega: string
  pais_entrega: string
  endereco_faturamento: string
  cidade_faturamento: string
  cep_faturamento: string
  pais_faturamento: string
  itens: NuvemFiscalPedidoItem[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  if (status === 'faturado') return 'COMPLETED'
  if (status === 'cancelado') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: NuvemFiscalPedidoItem): Lineitem {
  return {
    id: String(row.id_item),
    accountId: row.id_conta ? String(row.id_conta) : undefined,
    itemId: row.codigo_produto || undefined,
    itemDescription: row.descricao || undefined,
    unitAmount: row.preco_unitario,
    unitQuantity: row.quantidade,
    totalAmount: row.valor_total,
    taxAmount: row.valor_imposto,
    discountAmount: row.desconto || undefined,
  }
}

function mapShippingAddress(raw: NuvemFiscalPedido): Address | undefined {
  if (!raw.endereco_entrega && !raw.cidade_entrega) return undefined
  return {
    address1: raw.endereco_entrega || undefined,
    city: raw.cidade_entrega || undefined,
    postalCode: raw.cep_entrega || undefined,
    country: raw.pais_entrega || undefined,
  }
}

function mapBillingAddress(raw: NuvemFiscalPedido): Address | undefined {
  if (!raw.endereco_faturamento && !raw.cidade_faturamento) return undefined
  return {
    address1: raw.endereco_faturamento || undefined,
    city: raw.cidade_faturamento || undefined,
    postalCode: raw.cep_faturamento || undefined,
    country: raw.pais_faturamento || undefined,
  }
}

export function transformOrder(raw: NuvemFiscalPedido): Order {
  return {
    id: String(raw.id_pedido),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.id_cliente ? String(raw.id_cliente) : undefined,
    currency: raw.moeda || undefined,
    totalAmount: raw.valor_total,
    lineItems: (raw.itens ?? []).map(mapLineitem),
    billingAddress: mapBillingAddress(raw),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.data_pedido ? new Date(raw.data_pedido) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    id_cliente: order.contactId ? Number(order.contactId) : undefined,
    moeda: order.currency,
    data_pedido: toCalendarDate(order.postedAt),
    itens: order.lineItems?.map((li) => ({
      codigo_produto: li.itemId,
      descricao: li.itemDescription,
      preco_unitario: li.unitAmount,
      quantidade: li.unitQuantity,
      id_conta: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
