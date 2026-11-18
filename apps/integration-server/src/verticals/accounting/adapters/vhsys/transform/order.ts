/**
 * vhsys order (pedido) transform.
 *
 * vhsys sales orders share the same resource as invoices ("pedidos") but the
 * Order canonical type captures the order-management lifecycle rather than the
 * billing lifecycle.
 *
 * Endpoints:
 *   GET /pedidos        — list orders
 *   GET /pedidos/{id}   — get order
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits } from '../../shared/transform'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface VhsysPedidoItem {
  id_item?: string | number
  id_produto?: string | number
  descricao_item?: string
  qtde_item?: number
  valor_unit_item?: number | string
  valor_total_item?: number | string
  desconto_item?: number | string
  [key: string]: unknown
}

export interface VhsysPedidoOrder {
  id_pedido: string | number
  numero_pedido?: string | number
  id_cliente?: string | number
  situacao_pedido?: string  // 'A' = active/open, 'F' = completed, 'C' = cancelled
  valor_total?: number | string
  data_pedido?: string
  data_entrega?: string
  moeda_pedido?: string
  itens?: VhsysPedidoItem[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(raw: VhsysPedidoOrder): OrderStatus {
  const s = (raw.situacao_pedido ?? '').toUpperCase()
  if (s === 'C') return 'CANCELLED'
  if (s === 'F') return 'COMPLETED'
  if (s === 'A') return 'ACTIVE'
  return 'DRAFT'
}

function mapLineitem(item: VhsysPedidoItem): Lineitem {
  return {
    id: item.id_item !== undefined ? String(item.id_item) : undefined,
    itemId: item.id_produto !== undefined ? String(item.id_produto) : undefined,
    itemDescription: item.descricao_item || undefined,
    unitAmount: toMinorUnits(item.valor_unit_item),
    unitQuantity: item.qtde_item !== undefined ? Math.round(Number(item.qtde_item)) : undefined,
    totalAmount: toMinorUnits(item.valor_total_item),
    discountAmount: toMinorUnits(item.desconto_item),
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(raw: VhsysPedidoOrder): Order {
  const postedIso = toIsoDatetime(raw.data_pedido)
  return {
    id: String(raw.id_pedido),
    status: mapStatus(raw),
    type: 'SALES',
    contactId: raw.id_cliente !== undefined ? String(raw.id_cliente) : undefined,
    currency: raw.moeda_pedido || 'BRL',
    totalAmount: toMinorUnits(raw.valor_total),
    lineItems: Array.isArray(raw.itens) ? raw.itens.map(mapLineitem) : undefined,
    postedAt: postedIso ? new Date(postedIso) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
