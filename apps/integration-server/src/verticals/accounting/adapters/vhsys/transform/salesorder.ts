/**
 * vhsys sales order transform.
 *
 * Sales orders in vhsys are exposed via the same "pedidos" endpoint used for
 * invoices. The SalesOrder canonical type captures the sales/fulfilment
 * lifecycle while Invoice captures the billing lifecycle.
 *
 * Endpoints:
 *   GET /pedidos        — list orders
 *   GET /pedidos/{id}   — get order
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
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

export interface VhsysPedidoSales {
  id_pedido: string | number
  numero_pedido?: string | number
  id_cliente?: string | number
  situacao_pedido?: string  // 'A' = active/open, 'F' = completed, 'C' = cancelled
  valor_total?: number | string
  data_pedido?: string
  data_entrega?: string
  moeda_pedido?: string
  canal_venda?: string
  itens?: VhsysPedidoItem[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(raw: VhsysPedidoSales): SalesOrderStatus {
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

export function transformSalesOrder(raw: VhsysPedidoSales): SalesOrder {
  const postedIso = toIsoDatetime(raw.data_pedido)
  return {
    id: String(raw.id_pedido),
    status: mapStatus(raw),
    contactId: raw.id_cliente !== undefined ? String(raw.id_cliente) : undefined,
    currency: raw.moeda_pedido || 'BRL',
    salesChannel: raw.canal_venda || undefined,
    totalAmount: toMinorUnits(raw.valor_total),
    lineItems: Array.isArray(raw.itens) ? raw.itens.map(mapLineitem) : undefined,
    postedAt: postedIso ? new Date(postedIso) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
