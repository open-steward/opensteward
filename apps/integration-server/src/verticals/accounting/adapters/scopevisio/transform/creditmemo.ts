/**
 * Scopevisio credit note (Gutschrift) → canonical CreditMemo transform.
 *
 * Scopevisio exposes credit notes via:
 *   POST /credits   – search list
 *   GET  /credit/{documentNumber} – single record
 *
 * The API returns objects structurally equivalent to outgoing invoices but
 * with a negative totalGross.  Fields mirror ScopevisioOutgoingInvoice.
 *
 * Docs: https://appload.scopevisio.com/rest/swagger.json
 */

import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface ScopevisioCreditPosition {
  id?: number
  productNumber?: string | null
  name?: string | null
  description?: string | null
  quantity?: number | null
  unitPrice?: number | null
  totalGross?: number | null
  totalVat?: number | null
  accountNumber?: string | null
  [key: string]: unknown
}

export interface ScopevisioCredit {
  id?: number
  documentNumber?: string
  status?: string
  customerContactId?: number
  customerContactName?: string
  documentDate?: number      // epoch ms
  dueDate?: number           // epoch ms
  currency?: string
  totalGross?: number
  totalNet?: number
  totalVat?: number
  openAmount?: number
  isPaid?: boolean
  orderNumber?: string
  documentText?: string
  positions?: ScopevisioCreditPosition[]
  [key: string]: unknown
}

function mapStatus(raw: ScopevisioCredit): CreditMemoStatus {
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'CANCELLED' || s === 'STORNIERT') return 'VOIDED'
  if (raw.isPaid || s === 'PAID' || s === 'BEZAHLT') return 'PAID'
  if (s === 'POSTED' || s === 'GEBUCHT') {
    const open = raw.openAmount ?? 0
    const total = Math.abs(raw.totalGross ?? 0)
    if (open === 0) return 'PAID'
    if (open > 0 && open < total) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  return 'DRAFT'
}

function toDate(epochMs?: number | null): Date | undefined {
  if (!epochMs) return undefined
  return new Date(epochMs)
}

function mapPosition(pos: ScopevisioCreditPosition): Lineitem {
  return {
    id: pos.id !== undefined ? String(pos.id) : undefined,
    accountId: pos.accountNumber || undefined,
    itemId: pos.productNumber || undefined,
    itemName: pos.name || undefined,
    itemDescription: pos.description || undefined,
    unitAmount: pos.unitPrice ?? undefined,
    unitQuantity: pos.quantity !== undefined && pos.quantity !== null ? Math.round(pos.quantity) : undefined,
    totalAmount: pos.totalGross ?? undefined,
    taxAmount: pos.totalVat ?? undefined,
  }
}

export function transformCreditMemo(raw: ScopevisioCredit): CreditMemo {
  return {
    id: raw.documentNumber ?? (raw.id !== undefined ? String(raw.id) : undefined),
    status: mapStatus(raw),
    creditmemoNumber: raw.documentNumber || undefined,
    contactId: raw.customerContactId !== undefined ? String(raw.customerContactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalGross !== undefined ? Math.abs(raw.totalGross) : undefined,
    taxAmount: raw.totalVat !== undefined ? Math.abs(raw.totalVat) : undefined,
    balanceAmount: raw.openAmount ?? undefined,
    notes: raw.documentText || undefined,
    lineItems: (raw.positions ?? []).map(mapPosition),
    postedAt: toDate(raw.documentDate),
    dueAt: toDate(raw.dueDate),
    metadata: raw as Record<string, unknown>,
  }
}
