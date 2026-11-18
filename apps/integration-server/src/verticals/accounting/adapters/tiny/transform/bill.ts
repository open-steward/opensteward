/**
 * Tiny ERP v3 — Nota Fiscal Entrada (bill) transforms.
 *
 * Bills in Tiny are Notas Fiscais with tipo='E' (Entrada/purchase).
 * This module re-uses the TinyNotaFiscal interface from invoice.ts
 * and maps it to the canonical Bill schema.
 *
 * `situacao` mapping (same as invoices):
 *   1 = Em aberto     → SUBMITTED (created, not yet sent to SEFAZ)
 *   2 = Autorizado    → AUTHORIZED (SEFAZ-authorized)
 *   3 = Cancelado     → VOIDED
 *   4 = Ag. autorização → DRAFT
 *   5 = Denegado      → VOIDED
 *   6 = Inutilizado   → DELETED
 *   7 = Em digitação  → DRAFT
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import type { TinyNotaFiscal, TinyNotaFiscalItem } from './invoice'

// ── Status mapping ─────────────────────────────────────────────────────────────

function mapStatus(situacao?: number | null): BillStatus {
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

export function transformBill(raw: TinyNotaFiscal): Bill {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapStatus(raw.situacao),
    billNumber: raw.numero || undefined,
    contactId: raw.cliente?.id != null ? String(raw.cliente.id) : undefined,
    totalAmount: raw.valor ?? undefined,
    discountAmount: raw.valorDesconto ?? undefined,
    notes: raw.observacoes || undefined,
    lineItems: raw.itens ? mapItems(raw.itens) : undefined,
    postedAt: raw.dataEmissao ? new Date(raw.dataEmissao) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
