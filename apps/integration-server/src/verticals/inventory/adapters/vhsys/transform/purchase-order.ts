import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, pickNum, strMap, toIso} from './shared'

/**
 * Raw purchase-order record returned by GET /v2/ordens-compra or GET /v2/ordens-compra/:id.
 * VHSYS calls this "Ordem de Compra".
 */
export interface RawVhsysPurchaseOrder {
  id_ordem_compra: string | number
  numero_ordem_compra?: string | number
  id_fornecedor?: string | number
  nome_fornecedor?: string
  situacao_ordem_compra?: string
  moeda_ordem_compra?: string
  valor_total_ordem_compra?: number | string
  valor_subtotal_ordem_compra?: number | string
  id_deposito?: string | number
  data_ordem_compra?: string
  data_previsao_entrega?: string
  data_recebimento?: string
  itens?: Array<{
    id_produto?: string | number
    quantidade?: number | string
    quantidade_recebida?: number | string
    valor_unitario?: number | string
    valor_total?: number | string
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  const upper = (s ?? '').toUpperCase()
  if (upper === 'RASCUNHO' || upper === 'DRAFT') return 'draft'
  if (upper === 'ENVIADO' || upper === 'PENDENTE' || upper === 'AGUARDANDO') return 'sent'
  if (upper === 'RECEBIDO PARCIALMENTE' || upper === 'PARCIAL') return 'partially_received'
  if (upper === 'RECEBIDO' || upper === 'RECEIVED') return 'received'
  if (upper === 'CONCLUIDO' || upper === 'CONCLUÍDO' || upper === 'FECHADO') return 'closed'
  if (upper === 'CANCELADO' || upper === 'ANULADO') return 'cancelled'
  return 'draft'
}

export function transformPurchaseOrder(raw: RawVhsysPurchaseOrder): PurchaseOrder {
  const id = String(raw.id_ordem_compra)
  const totalVal = pickNum(raw.valor_total_ordem_compra)
  const subtotalVal = pickNum(raw.valor_subtotal_ordem_compra)

  return {
    id,
    externalId: id,
    number: raw.numero_ordem_compra != null ? String(raw.numero_ordem_compra) : undefined,
    supplierId: raw.id_fornecedor != null ? String(raw.id_fornecedor) : (raw.nome_fornecedor ?? ''),
    destinationLocationId: raw.id_deposito != null ? String(raw.id_deposito) : undefined,
    status: mapStatus(pickStr(raw.situacao_ordem_compra)),
    currency: pickStr(raw.moeda_ordem_compra) ?? 'BRL',
    subtotalAmount: subtotalVal !== undefined ? Math.round(subtotalVal * 100) : undefined,
    totalAmount: totalVal !== undefined ? Math.round(totalVal * 100) : undefined,
    lines: (raw.itens ?? []).map((l) => {
      const unitCostVal = pickNum(l.valor_unitario)
      const lineTotalVal = pickNum(l.valor_total)
      return {
        productId: l.id_produto != null ? String(l.id_produto) : '',
        quantityOrdered: pickNum(l.quantidade) ?? 0,
        quantityReceived: pickNum(l.quantidade_recebida),
        unitCost: unitCostVal !== undefined ? Math.round(unitCostVal * 100) : undefined,
        lineTotal: lineTotalVal !== undefined ? Math.round(lineTotalVal * 100) : undefined,
      }
    }),
    orderedAt: toIso(raw.data_ordem_compra),
    expectedAt: toIso(raw.data_previsao_entrega),
    receivedAt: toIso(raw.data_recebimento),
    platform: 'vhsys',
    metadata: strMap({ fornecedorNome: raw.nome_fornecedor }),
    raw,
  }
}
