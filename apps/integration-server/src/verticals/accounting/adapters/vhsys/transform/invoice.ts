/**
 * vhsys invoice (pedido / nota fiscal) transform.
 *
 * vhsys exposes sales orders as "pedidos" and can emit electronic invoices
 * (NF-e / NFS-e). The primary invoicing resource is the pedido list which
 * carries the full billing information.
 *
 * Endpoints:
 *   GET /pedidos           — list orders/invoices
 *   GET /pedidos/{id}      — get order/invoice
 *   POST /pedidos          — create
 *   PUT  /pedidos/{id}     — update
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits, toCalendarDate } from '../../shared/transform'

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

export interface VhsysPedido {
  id_pedido: string | number
  numero_pedido?: string | number
  id_cliente?: string | number
  nome_cliente?: string
  data_pedido?: string
  data_entrega?: string
  situacao_pedido?: string  // 'A' = open/active, 'F' = closed/paid, 'C' = cancelled
  valor_total?: number | string
  valor_desconto?: number | string
  valor_frete?: number | string
  moeda_pedido?: string
  observacao_pedido?: string
  forma_pagamento?: string
  itens?: VhsysPedidoItem[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(raw: VhsysPedido): InvoiceStatus {
  const s = (raw.situacao_pedido ?? '').toUpperCase()
  if (s === 'C') return 'VOIDED'
  if (s === 'F') return 'PAID'
  if (s === 'A') return 'AUTHORIZED'
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

export function transformInvoice(raw: VhsysPedido): Invoice {
  const numPedido =
    raw.numero_pedido !== undefined ? String(raw.numero_pedido) : String(raw.id_pedido)
  const postedIso = toIsoDatetime(raw.data_pedido)
  const dueIso = toIsoDatetime(raw.data_entrega)
  return {
    id: String(raw.id_pedido),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: numPedido,
    contactId: raw.id_cliente !== undefined ? String(raw.id_cliente) : undefined,
    currency: raw.moeda_pedido || 'BRL',
    totalAmount: toMinorUnits(raw.valor_total),
    discountAmount: toMinorUnits(raw.valor_desconto),
    notes: raw.observacao_pedido || undefined,
    lineItems: Array.isArray(raw.itens) ? raw.itens.map(mapLineitem) : undefined,
    postedAt: postedIso ? new Date(postedIso) : undefined,
    dueAt: dueIso ? new Date(dueIso) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → vhsys write body) ────────────────────────────────

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    id_cliente: invoice.contactId,
    moeda_pedido: invoice.currency,
    data_pedido: toCalendarDate(invoice.postedAt),
    data_entrega: toCalendarDate(invoice.dueAt),
    observacao_pedido: invoice.notes,
    itens: invoice.lineItems?.map((li) => ({
      id_produto: li.itemId,
      descricao_item: li.itemDescription,
      valor_unit_item: li.unitAmount,
      qtde_item: li.unitQuantity,
      desconto_item: li.discountAmount,
    })),
  }
}
