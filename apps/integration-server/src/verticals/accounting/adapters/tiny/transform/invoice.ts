/**
 * Tiny ERP v3 — Nota Fiscal (invoice) transforms.
 *
 * Tiny's `tipo` field:
 *   'S' = Saída (exit/sale) → canonical INVOICE
 *   'E' = Entrada (entry/purchase) → canonical BILL
 *
 * `situacao` values (BaseNotaFiscalModel enum 1-10):
 *   1 = Em aberto (created, not yet sent to SEFAZ) → SUBMITTED
 *   2 = Autorizado (authorized by SEFAZ) → AUTHORIZED
 *   3 = Cancelado (voided) → VOIDED
 *   4 = Aguardando autorização (waiting for auth) → DRAFT
 *   5 = Denegado (denied) → VOIDED
 *   6 = Inutilizado (invalidated) → DELETED
 *   7 = Em digitação (being typed) → DRAFT
 *   Others: SUBMITTED
 */

import type { Invoice, InvoiceStatus, InvoiceType } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Tiny raw types ─────────────────────────────────────────────────────────────

export interface TinyNotaFiscalCliente {
  id?: number
  nome?: string | null
  cpfCnpj?: string | null
  email?: string | null
  telefone?: string | null
  celular?: string | null
  [key: string]: unknown
}

export interface TinyNotaFiscalItem {
  idProduto?: number | null
  codigo?: string | null
  descricao?: string | null
  unidade?: string | null
  quantidade?: number | null
  valorUnitario?: number | null
  valorTotal?: number | null
  cfop?: string | null
  [key: string]: unknown
}

export interface TinyNotaFiscal {
  id?: number
  situacao?: number | null
  tipo?: string | null      // 'S' = Saída | 'E' = Entrada
  numero?: string | null
  serie?: string | null
  chaveAcesso?: string | null
  dataEmissao?: string | null
  cliente?: TinyNotaFiscalCliente
  valor?: number | null
  valorProdutos?: number | null
  valorFrete?: number | null
  valorDesconto?: number | null
  itens?: TinyNotaFiscalItem[]
  observacoes?: string | null
  [key: string]: unknown
}

// ── Status mapping ─────────────────────────────────────────────────────────────

function mapStatus(situacao?: number | null): InvoiceStatus {
  switch (situacao) {
    case 1: return 'SUBMITTED'   // Em aberto (created, not yet sent to SEFAZ)
    case 2: return 'AUTHORIZED'  // Autorizado (SEFAZ-authorized)
    case 3: return 'VOIDED'      // Cancelado
    case 4: return 'DRAFT'       // Aguardando autorização
    case 5: return 'VOIDED'      // Denegado
    case 6: return 'DELETED'     // Inutilizado
    case 7: return 'DRAFT'       // Em digitação
    default: return 'SUBMITTED'
  }
}

function mapType(tipo?: string | null): InvoiceType {
  return tipo === 'E' ? 'BILL' : 'INVOICE'
}

// ── Line items ─────────────────────────────────────────────────────────────────

function mapItems(items: TinyNotaFiscalItem[]): Lineitem[] {
  return (items ?? []).map((it) => ({
    itemId: it.idProduto != null ? String(it.idProduto) : undefined,
    itemName: it.descricao || undefined,
    itemDescription: it.descricao || undefined,
    itemSku: it.codigo || undefined,
    unitAmount: it.valorUnitario ?? undefined,
    unitQuantity: it.quantidade != null ? Math.round(it.quantidade) : undefined,
    totalAmount: it.valorTotal ?? undefined,
  }))
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformInvoice(raw: TinyNotaFiscal): Invoice {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    type: mapType(raw.tipo),
    status: mapStatus(raw.situacao),
    invoiceNumber: raw.numero || undefined,
    contactId: raw.cliente?.id != null ? String(raw.cliente.id) : undefined,
    totalAmount: raw.valor ?? undefined,
    discountAmount: raw.valorDesconto ?? undefined,
    notes: raw.observacoes || undefined,
    lineItems: raw.itens ? mapItems(raw.itens) : undefined,
    postedAt: raw.dataEmissao ? new Date(raw.dataEmissao) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
