import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

/**
 * Bling v3 pedidos de compra (purchase order) shape.
 * GET /pedidos/compras — list; GET /pedidos/compras/:id — single.
 *
 * situacao.valor: 0=draft, 1=open, 2=attended, 4=cancelled, 9=completed.
 * total / totalProdutos are decimal BRL values.
 */
export interface BlingPedidoCompra {
  id: number
  numero?: number
  data?: string
  dataPrevista?: string
  totalProdutos?: number
  total?: number
  fornecedor?: {
    id?: number
    nome?: string
  }
  situacao?: {
    id?: number
    valor?: number
  }
  itens?: BlingPedidoCompraItem[]
  observacoes?: string
  ordemCompra?: string
  [key: string]: unknown
}

export interface BlingPedidoCompraItem {
  descricao?: string
  codigoFornecedor?: string
  unidade?: string
  valor?: number
  quantidade?: number
  aliquotaIPI?: number
  descricaoDetalhada?: string
  produto?: {
    id?: number
    codigo?: string
  }
  [key: string]: unknown
}

function mapStatus(valor?: number): PurchaseOrderStatus {
  switch (valor) {
    case 0: return 'DRAFT'
    case 1: return 'ACTIVE'
    case 2:
    case 9: return 'COMPLETED'
    case 4: return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapItems(items?: BlingPedidoCompraItem[]): Lineitem[] {
  if (!items?.length) return []
  return items.map((item) => ({
    itemId: item.produto?.id != null ? String(item.produto.id) : (item.codigoFornecedor || undefined),
    itemDescription: item.descricao || undefined,
    unitAmount: item.valor != null ? Math.round(item.valor * 100) : undefined,
    unitQuantity: item.quantidade != null ? Math.round(item.quantidade) : undefined,
    totalAmount:
      item.valor != null && item.quantidade != null
        ? Math.round(item.valor * item.quantidade * 100)
        : undefined,
  }))
}

export function transformPurchaseOrder(raw: BlingPedidoCompra): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.situacao?.valor),
    contactId: raw.fornecedor?.id != null ? String(raw.fornecedor.id) : undefined,
    totalAmount: raw.total != null ? Math.round(raw.total * 100) : undefined,
    lineItems: mapItems(raw.itens),
    postedAt: raw.data ? new Date(raw.data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
