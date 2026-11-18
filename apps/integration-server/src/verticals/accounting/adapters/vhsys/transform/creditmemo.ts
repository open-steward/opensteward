/**
 * vhsys credit memo (nota de crédito / devolução) transform.
 *
 * vhsys does not have a dedicated credit memo endpoint; devoluções (returns)
 * are tracked via a negative-value pedido or an explicit devolucao resource.
 * This transform maps the "devolucoes" payload to the canonical CreditMemo.
 *
 * Endpoints:
 *   GET /devolucoes        — list credit memos / returns
 *   GET /devolucoes/{id}   — get credit memo
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits } from '../../shared/transform'

// ── Raw API types ─────────────────────────────────────────────────────────────

export interface VhsysDevolucaoItem {
  id_item?: string | number
  id_produto?: string | number
  descricao_item?: string
  qtde_item?: number
  valor_unit_item?: number | string
  valor_total_item?: number | string
  [key: string]: unknown
}

export interface VhsysDevolucao {
  id_devolucao: string | number
  numero_devolucao?: string | number
  id_cliente?: string | number
  situacao?: string  // 'A' = open, 'C' = cancelled, 'F' = completed/paid
  valor_total?: number | string
  data_devolucao?: string
  moeda?: string
  itens?: VhsysDevolucaoItem[]
  [key: string]: unknown
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapStatus(raw: VhsysDevolucao): CreditMemoStatus {
  const s = (raw.situacao ?? '').toUpperCase()
  if (s === 'C') return 'VOIDED'
  if (s === 'F') return 'PAID'
  if (s === 'A') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(item: VhsysDevolucaoItem): Lineitem {
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

export function transformCreditMemo(raw: VhsysDevolucao): CreditMemo {
  const postedIso = toIsoDatetime(raw.data_devolucao)
  return {
    id: String(raw.id_devolucao),
    status: mapStatus(raw),
    creditmemoNumber:
      raw.numero_devolucao !== undefined ? String(raw.numero_devolucao) : String(raw.id_devolucao),
    contactId: raw.id_cliente !== undefined ? String(raw.id_cliente) : undefined,
    currency: raw.moeda || 'BRL',
    totalAmount: toMinorUnits(raw.valor_total),
    lineItems: Array.isArray(raw.itens) ? raw.itens.map(mapLineitem) : undefined,
    postedAt: postedIso ? new Date(postedIso) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
