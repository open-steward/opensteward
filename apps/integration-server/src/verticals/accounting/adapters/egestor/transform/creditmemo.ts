/**
 * eGestor Devoluções de Vendas (Sales Returns) → canonical CreditMemo
 * transform.
 *
 * eGestor "devolucoes" endpoint: GET /api/v1/devolucoes
 * Sales returns map naturally to credit memos (negative invoices).
 */
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface EgestorDevolucaoProduto {
  codigo: number
  codProduto: number
  preco?: number
  quant?: number
  desconto?: number
  descricao?: string
  codigoProprio?: string
  [key: string]: unknown
}

export interface EgestorDevolucao {
  codigo: number
  codContato?: number
  nomeContato?: string
  codVenda?: number
  numNota?: string
  dtDevolucao?: string
  dtCad?: string
  valorTotal?: number
  obs?: string
  tags?: string[]
  /** 50=completed return */
  situacao?: number
  ativo?: number
  produtos?: EgestorDevolucaoProduto[]
  [key: string]: unknown
}

function mapStatus(raw: EgestorDevolucao): CreditMemoStatus {
  if (raw.ativo === 0) return 'VOIDED'
  if (raw.situacao === 50) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(p: EgestorDevolucaoProduto): Lineitem {
  const qty = p.quant ?? 1
  const unit = p.preco ?? 0
  const disc = p.desconto ?? 0
  return {
    id: String(p.codigo),
    itemId: p.codProduto ? String(p.codProduto) : undefined,
    itemSku: p.codigoProprio || undefined,
    itemDescription: p.descricao || undefined,
    unitAmount: unit,
    unitQuantity: qty,
    discountAmount: disc || undefined,
    totalAmount: unit * qty - disc,
  }
}

export function transformCreditMemo(raw: EgestorDevolucao): CreditMemo {
  return {
    id: String(raw.codigo),
    status: mapStatus(raw),
    creditmemoNumber: raw.numNota || String(raw.codigo),
    contactId: raw.codContato ? String(raw.codContato) : undefined,
    totalAmount: raw.valorTotal,
    notes: raw.obs || undefined,
    lineItems: (raw.produtos ?? []).map(mapLineitem),
    postedAt: raw.dtDevolucao ? new Date(raw.dtDevolucao) : undefined,
    createdAt: raw.dtCad ? new Date(raw.dtCad) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
