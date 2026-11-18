/**
 * Transform a raw Olist Tiny ERP v3 ordem-de-compra into the canonical PurchaseOrder schema.
 *
 * Tiny API v3 GET /ordem-compra (list) and GET /ordem-compra/{id} (get) response
 * fields, confirmed against the public-api/v3 spec (ListarOrdemCompraModelResponse /
 * ObterOrdemCompraModelResponse):
 *   id, numero (list shape) | numeroPedido (get shape), situacao (0|1|2|3),
 *   contato{id,nome}, data, dataEntrega, dataPrevista,
 *   totalPedidoCompra, totalProdutos, desconto, frete,
 *   itens[]{produto{id,sku,descricao}, quantidade, valorUnitario,
 *           quantidadeRecebida}
 *
 * There is no deposito field on either shape — Tiny does not return a
 * destination location for purchase orders.
 *
 * Tiny does not expose stock-transfer or stock-adjustment resources
 * on the public v3 API — those are not implemented.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso, toMinorUnits} from './shared'

export interface RawTinyErpOrdemCompraItem {
  produto?: { id?: number | string; sku?: string; descricao?: string }
  quantidade?: number
  valorUnitario?: number
  quantidadeRecebida?: number
  [key: string]: unknown
}

export interface RawTinyErpOrdemCompra {
  id: number | string
  /** Present on the list shape. */
  numero?: string | number
  /** Present on the get-by-id shape instead of numero. */
  numeroPedido?: string | number
  /** 0 = Em Aberto, 1 = Atendido, 2 = Cancelado, 3 = Em Andamento. */
  situacao?: number | string
  contato?: { id?: number | string; nome?: string }
  data?: string
  dataEntrega?: string
  dataPrevista?: string
  totalPedidoCompra?: number
  totalProdutos?: number
  desconto?: number
  frete?: number
  itens?: RawTinyErpOrdemCompraItem[]
  [key: string]: unknown
}

/**
 * Map Tiny public-api/v3 situacao codes to canonical PurchaseOrderStatus.
 * 0 = Em Aberto (open, not yet actioned)   → draft
 * 3 = Em Andamento (in progress)           → sent
 * 1 = Atendido (fulfilled)                 → received
 * 2 = Cancelado                            → cancelled
 * Numbers may arrive as a JSON number or as a numeric string.
 */
function mapStatus(s: number | string | undefined): PurchaseOrderStatus {
  const code = typeof s === 'string' ? Number(s) : s
  switch (code) {
    case 0:
      return 'draft'
    case 3:
      return 'sent'
    case 1:
      return 'received'
    case 2:
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawTinyErpOrdemCompra): PurchaseOrder {
  const totalMinor = toMinorUnits(raw.totalPedidoCompra)
  const subtotalMinor = toMinorUnits(raw.totalProdutos)

  return {
    id: String(raw.id),
    externalId: String(raw.id),
    number: pickStr(raw.numero ?? raw.numeroPedido),
    supplierId: raw.contato?.id != null ? String(raw.contato.id) : '',
    // Tiny v3 ordem-compra responses do not include a deposito/location field.
    destinationLocationId: undefined,
    status: mapStatus(raw.situacao),
    currency: 'BRL',
    subtotalAmount: subtotalMinor,
    totalAmount: totalMinor,
    lines: (raw.itens ?? []).map((item) => ({
      productId: item.produto?.id != null ? String(item.produto.id) : '',
      quantityOrdered: item.quantidade ?? 0,
      quantityReceived: item.quantidadeRecebida,
      unitCost: toMinorUnits(item.valorUnitario),
      lineTotal:
        item.quantidade != null && item.valorUnitario != null
          ? toMinorUnits(item.quantidade * item.valorUnitario)
          : undefined,
    })),
    expectedAt: toIso(raw.dataPrevista ?? raw.dataEntrega),
    orderedAt: toIso(raw.data),
    platform: 'tiny-erp',
    metadata: strMap({
      situacao: raw.situacao,
      contatoNome: raw.contato?.nome,
      desconto: raw.desconto,
      frete: raw.frete,
    }),
    raw,
  }
}
