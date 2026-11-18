/**
 * Tiny ERP v3 — Ordem de Compra (Purchase Orders) transform.
 *
 * Endpoint: GET /ordem-compra, GET /ordem-compra/:id
 *
 * `situacao` values (integer enum), per Tiny's public-api/v3 spec. The labels
 * here previously read "Aprovada"/"Finalizada" for 1 and 3, which are not the
 * vendor's names, and the mapping followed those invented labels — so every
 * fulfilled purchase order reported as still active and every in-progress one
 * as done. The sibling inventory/tiny-erp adapter maps the same codes
 * correctly (1 → received, 3 → sent).
 *
 *   0 = Em Aberto (open, not yet actioned) → ACTIVE
 *   1 = Atendido (fulfilled)               → COMPLETED
 *   2 = Cancelado                          → CANCELLED
 *   3 = Em Andamento (in progress)         → ACTIVE
 *
 * The codes arrive as a JSON number or as a numeric string, so both are
 * accepted — the sibling adapter hit the string form live.
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'
import type { Address } from '../../../schema/shared'

// ── Raw Tiny types ─────────────────────────────────────────────────────────────

interface TinyOrdemCompraContato {
  id?: number | null
  nome?: string | null
  cpfCnpj?: string | null
  email?: string | null
  endereco?: {
    endereco?: string | null
    complemento?: string | null
    municipio?: string | null
    cep?: string | null
    uf?: string | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

interface TinyOrdemCompraItem {
  produto?: {
    id?: number | null
    codigo?: string | null
    nome?: string | null
    [key: string]: unknown
  } | null
  quantidade?: number | null
  valorUnitario?: number | null
  [key: string]: unknown
}

export interface TinyOrdemCompra {
  id?: number | null
  numero?: string | null
  data?: string | null
  dataPrevista?: string | null
  situacao?: number | null
  desconto?: string | null
  frete?: number | null
  totalProdutos?: number | null
  totalPedidoCompra?: number | null
  contato?: TinyOrdemCompraContato | null
  observacoes?: string | null
  itens?: TinyOrdemCompraItem[]
  [key: string]: unknown
}

// ── Mappings ──────────────────────────────────────────────────────────────────

function mapStatus(situacao?: number | string | null): PurchaseOrderStatus {
  const code = typeof situacao === 'string' ? Number(situacao) : situacao
  switch (code) {
    case 0: return 'ACTIVE'      // Em Aberto
    case 1: return 'COMPLETED'   // Atendido (fulfilled)
    case 2: return 'CANCELLED'   // Cancelado
    case 3: return 'ACTIVE'      // Em Andamento (in progress)
    default: return 'ACTIVE'
  }
}

function mapAddress(
  end?: TinyOrdemCompraContato['endereco'] | null,
): Address | undefined {
  if (!end) return undefined
  return {
    address1: end.endereco || undefined,
    address2: end.complemento || undefined,
    city: end.municipio || undefined,
    region: end.uf || undefined,
    postalCode: end.cep || undefined,
  }
}

function mapItems(items: TinyOrdemCompraItem[]): Lineitem[] {
  return (items ?? []).map((it) => ({
    itemId: it.produto?.id != null ? String(it.produto.id) : undefined,
    itemName: it.produto?.nome || undefined,
    itemSku: it.produto?.codigo || undefined,
    unitAmount: it.valorUnitario ?? undefined,
    unitQuantity: it.quantidade != null ? Math.round(it.quantidade) : undefined,
  }))
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformPurchaseOrder(raw: TinyOrdemCompra): PurchaseOrder {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapStatus(raw.situacao),
    contactId: raw.contato?.id != null ? String(raw.contato.id) : undefined,
    totalAmount: raw.totalPedidoCompra ?? raw.totalProdutos ?? undefined,
    lineItems: raw.itens ? mapItems(raw.itens) : undefined,
    billingAddress: mapAddress(raw.contato?.endereco),
    postedAt: raw.data ? new Date(raw.data) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
