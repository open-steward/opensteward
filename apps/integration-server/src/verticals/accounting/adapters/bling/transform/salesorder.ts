import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

/**
 * Bling v3 pedidos de venda (sales order) shape.
 * GET /pedidos/vendas — list; GET /pedidos/vendas/:id — single.
 *
 * situacao.valor: 0=draft, 1=open, 2=attended, 3=partially-attended,
 *   4=cancelled, 5=awaiting-nfe, 9=completed.
 * total / totalProdutos are decimal BRL values.
 */
export interface BlingPedidoVenda {
  id: number
  numero?: number
  numeroLoja?: string
  data?: string
  dataSaida?: string
  dataPrevista?: string
  totalProdutos?: number
  total?: number
  contato?: {
    id?: number
    nome?: string
    tipoPessoa?: string
    numeroDocumento?: string
  }
  situacao?: {
    id?: number
    valor?: number
  }
  itens?: BlingPedidoVendaItem[]
  observacoes?: string
  numeroPedidoCompra?: string
  desconto?: { valor?: number; unidade?: string }
  [key: string]: unknown
}

export interface BlingPedidoVendaItem {
  id?: number
  codigo?: string
  descricao?: string
  unidade?: string
  quantidade?: number
  valor?: number
  desconto?: number
  aliquotaIPI?: number
  produto?: { id?: number }
  [key: string]: unknown
}

function mapStatus(valor?: number): SalesOrderStatus {
  switch (valor) {
    case 0: return 'DRAFT'
    case 1: return 'ACTIVE'
    case 2:
    case 9: return 'COMPLETED'
    case 4: return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapItems(items?: BlingPedidoVendaItem[]): Lineitem[] {
  if (!items?.length) return []
  return items.map((item) => ({
    id: item.id != null ? String(item.id) : undefined,
    itemId: item.produto?.id != null ? String(item.produto.id) : (item.codigo || undefined),
    itemDescription: item.descricao || undefined,
    unitAmount: item.valor != null ? Math.round(item.valor * 100) : undefined,
    unitQuantity: item.quantidade != null ? Math.round(item.quantidade) : undefined,
    totalAmount:
      item.valor != null && item.quantidade != null
        ? Math.round(item.valor * item.quantidade * 100)
        : undefined,
  }))
}

export function transformSalesOrder(raw: BlingPedidoVenda): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.situacao?.valor),
    contactId: raw.contato?.id != null ? String(raw.contato.id) : undefined,
    totalAmount: raw.total != null ? Math.round(raw.total * 100) : undefined,
    lineItems: mapItems(raw.itens),
    postedAt: raw.data ? new Date(raw.data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
