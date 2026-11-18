import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem, Address } from '../../../schema/shared'

export interface NuvemFiscalOrdemCompraItem {
  id_item: number
  codigo_produto: string
  descricao: string
  preco_unitario: number
  quantidade: number
  valor_total: number
  id_conta: number
  [key: string]: unknown
}

export interface NuvemFiscalOrdemCompra {
  id_ordem_compra: number
  id_fornecedor: number
  nome_fornecedor: string
  moeda: string
  valor_total: number
  data_ordem: string
  status: string
  endereco_entrega: string
  cidade_entrega: string
  cep_entrega: string
  pais_entrega: string
  nossa_referencia: string
  sua_referencia: string
  itens: NuvemFiscalOrdemCompraItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'recebido') return 'COMPLETED'
  if (status === 'cancelado') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineitem(row: NuvemFiscalOrdemCompraItem): Lineitem {
  return {
    id: String(row.id_item),
    accountId: row.id_conta ? String(row.id_conta) : undefined,
    itemId: row.codigo_produto || undefined,
    itemDescription: row.descricao || undefined,
    unitAmount: row.preco_unitario,
    unitQuantity: row.quantidade,
    totalAmount: row.valor_total,
  }
}

function mapShippingAddress(raw: NuvemFiscalOrdemCompra): Address | undefined {
  if (!raw.endereco_entrega && !raw.cidade_entrega) return undefined
  return {
    address1: raw.endereco_entrega || undefined,
    city: raw.cidade_entrega || undefined,
    postalCode: raw.cep_entrega || undefined,
    country: raw.pais_entrega || undefined,
  }
}

export function transformPurchaseOrder(raw: NuvemFiscalOrdemCompra): PurchaseOrder {
  return {
    id: String(raw.id_ordem_compra),
    status: mapStatus(raw.status),
    contactId: raw.id_fornecedor ? String(raw.id_fornecedor) : undefined,
    currency: raw.moeda || undefined,
    totalAmount: raw.valor_total,
    lineItems: (raw.itens ?? []).map(mapLineitem),
    shippingAddress: mapShippingAddress(raw),
    postedAt: raw.data_ordem ? new Date(raw.data_ordem) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(
  order: Partial<PurchaseOrder>,
): Record<string, unknown> {
  return {
    id_fornecedor: order.contactId ? Number(order.contactId) : undefined,
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
