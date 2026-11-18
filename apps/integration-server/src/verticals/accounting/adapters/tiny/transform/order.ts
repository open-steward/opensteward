/**
 * Tiny ERP v3 — Pedidos (Sales Orders / Orders) transform.
 *
 * Endpoint: GET /pedidos, GET /pedidos/:id
 *
 * Tiny `pedidos` are sales orders. They map to the canonical Order schema
 * with type='SALES'. The same raw type is re-used by salesorder.ts.
 *
 * `situacao` values:
 *   0 = Aberta (open)              → ACTIVE
 *   1 = Faturada (invoiced)        → COMPLETED
 *   2 = Cancelada (cancelled)      → CANCELLED
 *   3 = Aprovada (approved)        → ACTIVE
 *   4 = Preparando envio           → ACTIVE
 *   5 = Enviado (shipped)          → ACTIVE
 *   6 = Entregue (delivered)       → COMPLETED
 *   7 = Pronto para envio          → ACTIVE
 *   8 = Dados incompletos          → DRAFT
 *   9 = Não entregue               → ACTIVE
 */

import type { Order, OrderStatus, OrderType } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'
import type { Address } from '../../../schema/shared'

// ── Raw Tiny types ─────────────────────────────────────────────────────────────

export interface TinyPedidoCliente {
  id?: number | null
  nome?: string | null
  cpfCnpj?: string | null
  email?: string | null
  telefone?: string | null
  endereco?: TinyEndereco | null
  [key: string]: unknown
}

export interface TinyEndereco {
  endereco?: string | null
  numero?: string | null
  complemento?: string | null
  bairro?: string | null
  municipio?: string | null
  cep?: string | null
  uf?: string | null
  pais?: string | null
  [key: string]: unknown
}

export interface TinyPedidoItem {
  produto?: {
    id?: number | null
    codigo?: string | null
    nome?: string | null
    [key: string]: unknown
  } | null
  quantidade?: number | null
  valorUnitario?: number | null
  infoAdicional?: string | null
  [key: string]: unknown
}

export interface TinyPedido {
  id?: number | null
  numeroPedido?: number | null
  situacao?: number | null
  data?: string | null
  dataEntrega?: string | null
  dataPrevista?: string | null
  dataCriacao?: string | null
  valorTotalProdutos?: number | null
  valorTotalPedido?: number | null
  valor?: string | null
  valorDesconto?: number | null
  valorFrete?: number | null
  valorOutrasDespesas?: number | null
  observacoes?: string | null
  cliente?: TinyPedidoCliente | null
  enderecoEntrega?: TinyEndereco | null
  itens?: TinyPedidoItem[]
  [key: string]: unknown
}

// ── Mappings ──────────────────────────────────────────────────────────────────

function mapStatus(situacao?: number | null): OrderStatus {
  switch (situacao) {
    case 0: return 'ACTIVE'      // Aberta
    case 1: return 'COMPLETED'   // Faturada
    case 2: return 'CANCELLED'   // Cancelada
    case 3: return 'ACTIVE'      // Aprovada
    case 4: return 'ACTIVE'      // Preparando envio
    case 5: return 'ACTIVE'      // Enviado
    case 6: return 'COMPLETED'   // Entregue
    case 7: return 'ACTIVE'      // Pronto para envio
    case 8: return 'DRAFT'       // Dados incompletos
    case 9: return 'ACTIVE'      // Não entregue
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

export function transformOrder(raw: TinyPedido): Order {
  const totalAmount =
    raw.valorTotalPedido ??
    (raw.valor != null ? parseFloat(raw.valor) : undefined)

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapStatus(raw.situacao),
    type: 'SALES' as OrderType,
    contactId: raw.cliente?.id != null ? String(raw.cliente.id) : undefined,
    totalAmount: totalAmount ?? undefined,
    lineItems: raw.itens ? mapItems(raw.itens) : undefined,
    billingAddress: mapAddress(raw.cliente?.endereco),
    shippingAddress: mapAddress(raw.enderecoEntrega),
    postedAt: raw.data ? new Date(raw.data) : (raw.dataCriacao ? new Date(raw.dataCriacao) : undefined),
    createdAt: raw.dataCriacao ? new Date(raw.dataCriacao) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
