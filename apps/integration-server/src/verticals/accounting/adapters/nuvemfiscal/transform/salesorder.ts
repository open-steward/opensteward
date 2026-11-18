import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface NuvemFiscalOrdemVendaItem {
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

export interface NuvemFiscalOrdemVenda {
  id_ordem_venda: number
  id_cliente: number
  nome_cliente: string
  moeda: string
  valor_total: number
  data_ordem: string
  status: string
  endereco_entrega: string
  cidade_entrega: string
  cep_entrega: string
  pais_entrega: string
  endereco_faturamento: string
  cidade_faturamento: string
  cep_faturamento: string
  pais_faturamento: string
  itens: NuvemFiscalOrdemVendaItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  if (status === 'faturado') return 'COMPLETED'
  if (status === 'cancelado') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: NuvemFiscalOrdemVendaItem): Lineitem {
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

function mapShippingAddress(raw: NuvemFiscalOrdemVenda): Address | undefined {
  if (!raw.endereco_entrega && !raw.cidade_entrega) return undefined
  return {
    address1: raw.endereco_entrega || undefined,
    city: raw.cidade_entrega || undefined,
    postalCode: raw.cep_entrega || undefined,
    country: raw.pais_entrega || undefined,
  }
}

function mapBillingAddress(raw: NuvemFiscalOrdemVenda): Address | undefined {
  if (!raw.endereco_faturamento && !raw.cidade_faturamento) return undefined
  return {
    address1: raw.endereco_faturamento || undefined,
    city: raw.cidade_faturamento || undefined,
    postalCode: raw.cep_faturamento || undefined,
    country: raw.pais_faturamento || undefined,
  }
}

export function transformSalesOrder(raw: NuvemFiscalOrdemVenda): SalesOrder {
  return {
    id: String(raw.id_ordem_venda),
    status: mapStatus(raw.status),
    contactId: raw.id_cliente ? String(raw.id_cliente) : undefined,
    currency: raw.moeda || undefined,
    totalAmount: raw.valor_total,
    lineItems: (raw.itens ?? []).map(mapLineitem),
    billingAddress: mapBillingAddress(raw),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.data_ordem ? new Date(raw.data_ordem) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    id_cliente: order.contactId ? Number(order.contactId) : undefined,
    moeda: order.currency,
    data_ordem: toCalendarDate(order.postedAt),
    itens: order.lineItems?.map((li) => ({
      codigo_produto: li.itemId,
      descricao: li.itemDescription,
      preco_unitario: li.unitAmount,
      quantidade: li.unitQuantity,
      id_conta: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
