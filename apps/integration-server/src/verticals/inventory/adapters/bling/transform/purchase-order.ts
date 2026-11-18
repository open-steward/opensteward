/**
 * Bling purchase-order transform.
 *
 * GET /Api/v3/pedidos/compras        — list (data: RawBlingPedidoCompra[])
 * GET /Api/v3/pedidos/compras/{id}   — single (data: RawBlingPedidoCompra)
 *
 * Key list fields: id, numero, data, dataPrevista,
 *   totalProdutos, total, fornecedor { id }, situacao { valor }
 *
 * Key detail fields (find): all of the above plus
 *   itens[], desconto, categoria, tributacao, transporte, parcelas[]
 *
 * Bling situacao.valor values (integer) — mapped best-effort:
 *   6 = Em Aberto (draft/open), 7 = Atendido (received),
 *   9 = Cancelado (cancelled). Others → draft.
 *
 * Amounts are in BRL (float). Converted to minor units (centavos).
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {strMap, toIso} from './shared'

export interface RawBlingPedidoCompraItem {
  descricao?: string
  codigoFornecedor?: string
  unidade?: string
  valor?: number
  quantidade?: number
  aliquotaIPI?: number
  descricaoDetalhada?: string
  produto?: { id?: number; codigo?: string }
}

export interface RawBlingPedidoCompra {
  id: number
  numero?: number
  data?: string
  dataPrevista?: string
  totalProdutos?: number
  total?: number
  fornecedor?: { id?: number }
  situacao?: { valor?: number }
  desconto?: { valor?: number; unidade?: string }
  observacoes?: string
  observacoesInternas?: string
  itens?: RawBlingPedidoCompraItem[]
  [key: string]: unknown
}

function mapStatus(valor: number | undefined): PurchaseOrderStatus {
  switch (valor) {
    case 6: return 'draft'
    case 7: return 'received'
    case 9: return 'cancelled'
    default: return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawBlingPedidoCompra): PurchaseOrder {
  // Amounts in BRL floats → integer centavos
  const totalAmount = raw.total !== undefined ? Math.round(raw.total * 100) : undefined
  const subtotalAmount = raw.totalProdutos !== undefined ? Math.round(raw.totalProdutos * 100) : undefined

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: raw.numero !== undefined ? String(raw.numero) : undefined,
    supplierId: raw.fornecedor?.id != null ? String(raw.fornecedor.id) : '',
    destinationLocationId: undefined,
    status: mapStatus(raw.situacao?.valor),
    currency: 'BRL',
    subtotalAmount,
    totalAmount,
    lines: (raw.itens ?? []).map((item) => ({
      productId: item.produto?.id != null ? String(item.produto.id) : '',
      quantityOrdered: item.quantidade ?? 0,
      quantityReceived: undefined,
      unitCost: item.valor !== undefined ? Math.round(item.valor * 100) : undefined,
      lineTotal: item.valor !== undefined && item.quantidade !== undefined
        ? Math.round(item.valor * item.quantidade * 100)
        : undefined,
    })),
    expectedAt: toIso(raw.dataPrevista),
    orderedAt: toIso(raw.data),
    receivedAt: undefined,
    platform: 'bling',
    metadata: strMap({
      observacoes: raw.observacoes,
      observacoesInternas: raw.observacoesInternas,
      situacaoValor: raw.situacao?.valor,
    }),
    raw,
  }
}
