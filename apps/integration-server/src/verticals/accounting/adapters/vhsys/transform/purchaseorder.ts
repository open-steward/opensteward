/**
 * vhsys purchase order (ordem de compra) transform.
 *
 * vhsys purchase orders are exposed via the "ordens_compra" resource.
 *
 * Endpoints:
 *   GET /ordens_compra        — list purchase orders
 *   GET /ordens_compra/{id}   — get purchase order
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits } from '../../shared/transform'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface VhsysOrdemCompraItem {
  id_item?: string | number
  id_produto?: string | number
  descricao_item?: string
  qtde_item?: number
  valor_unit_item?: number | string
  valor_total_item?: number | string
  [key: string]: unknown
}

export interface VhsysOrdemCompra {
  id_ordem_compra: string | number
  numero_ordem?: string | number
  id_fornecedor?: string | number
  situacao?: string  // 'A' = active/open, 'F' = completed/received, 'C' = cancelled
  valor_total?: number | string
  data_ordem?: string
  data_entrega?: string
  moeda?: string
  itens?: VhsysOrdemCompraItem[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(raw: VhsysOrdemCompra): PurchaseOrderStatus {
  const s = (raw.situacao ?? '').toUpperCase()
  if (s === 'C') return 'CANCELLED'
  if (s === 'F') return 'COMPLETED'
  if (s === 'A') return 'ACTIVE'
  return 'DRAFT'
}

function mapLineitem(item: VhsysOrdemCompraItem): Lineitem {
  return {
    id: item.id_item !== undefined ? String(item.id_item) : undefined,
    itemId: item.id_produto !== undefined ? String(item.id_produto) : undefined,
    itemDescription: item.descricao_item || undefined,
    unitAmount: toMinorUnits(item.valor_unit_item),
    unitQuantity: item.qtde_item !== undefined ? Math.round(Number(item.qtde_item)) : undefined,
    totalAmount: toMinorUnits(item.valor_total_item),
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformPurchaseOrder(raw: VhsysOrdemCompra): PurchaseOrder {
  const postedIso = toIsoDatetime(raw.data_ordem)
  return {
    id: String(raw.id_ordem_compra),
    status: mapStatus(raw),
    contactId: raw.id_fornecedor !== undefined ? `supp_${raw.id_fornecedor}` : undefined,
    currency: raw.moeda || 'BRL',
    totalAmount: toMinorUnits(raw.valor_total),
    lineItems: Array.isArray(raw.itens) ? raw.itens.map(mapLineitem) : undefined,
    postedAt: postedIso ? new Date(postedIso) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
