/**
 * Tiny ERP v3 — Pedidos as SalesOrders transform.
 *
 * Endpoint: GET /pedidos, GET /pedidos/:id
 *
 * Tiny's `pedidos` (sales orders) are mapped to the canonical SalesOrder
 * schema. This module re-uses TinyPedido from order.ts.
 *
 * `situacao` values are identical to the Order mapping (see order.ts).
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'
import type { TinyPedido, TinyPedidoItem, TinyEndereco } from './order'
import type { Address } from '../../../schema/shared'

export type { TinyPedido }

// ── Mappings ──────────────────────────────────────────────────────────────────

function mapStatus(situacao?: number | null): SalesOrderStatus {
  switch (situacao) {
    case 2: return 'CANCELLED'
    case 1:
    case 6: return 'COMPLETED'
    case 8: return 'DRAFT'
    default: return 'ACTIVE'
  }
}

function mapAddress(end?: TinyEndereco | null): Address | undefined {
  if (!end) return undefined
  return {
    address1: end.endereco || undefined,
    address2: end.complemento || undefined,
    city: end.municipio || undefined,
    region: end.uf || undefined,
    postalCode: end.cep || undefined,
  }
}

function mapItems(items: TinyPedidoItem[]): Lineitem[] {
  return (items ?? []).map((it) => ({
    itemId: it.produto?.id != null ? String(it.produto.id) : undefined,
    itemName: it.produto?.nome || undefined,
    itemSku: it.produto?.codigo || undefined,
    unitAmount: it.valorUnitario ?? undefined,
    unitQuantity: it.quantidade != null ? Math.round(it.quantidade) : undefined,
    notes: it.infoAdicional || undefined,
  }))
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformSalesOrder(raw: TinyPedido): SalesOrder {
  const totalAmount =
    raw.valorTotalPedido ??
    (raw.valor != null ? parseFloat(raw.valor) : undefined)

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapStatus(raw.situacao),
    contactId: raw.cliente?.id != null ? String(raw.cliente.id) : undefined,
    totalAmount: totalAmount ?? undefined,
    lineItems: raw.itens ? mapItems(raw.itens) : undefined,
    billingAddress: mapAddress(raw.cliente?.endereco ?? null),
    shippingAddress: mapAddress(raw.enderecoEntrega ?? null),
    postedAt: raw.data ? new Date(raw.data) : (raw.dataCriacao ? new Date(raw.dataCriacao) : undefined),
    createdAt: raw.dataCriacao ? new Date(raw.dataCriacao) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
