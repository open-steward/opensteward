/**
 * Scopevisio incoming-invoice → canonical Bill transform.
 *
 * Scopevisio field notes (incoming invoice / Rechnungseingang):
 *  - `id`                    : internal numeric master ID
 *  - `idOrNumber` / `number` : invoice number as used in path params
 *  - `documentNumber`        : external document number (supplier's invoice number)
 *  - `receivedDate`          : epoch ms – when the invoice was received
 *  - `dueDate`               : epoch ms
 *  - `totalGross`            : total incl. VAT
 *  - `totalVat`              : VAT portion
 *  - `openAmount`            : outstanding balance
 *  - `supplierContactId`     : internal supplier contact ID
 *  - `currency`              : ISO 4217
 *  - `status`                : string
 *
 * List endpoint: POST /incominginvoices
 * Detail endpoint: GET /incominginvoice/{idOrNumber}
 */

import type { Bill, BillStatus } from '../../../schema/bill'

export interface ScopevisioIncomingInvoice {
  id?: number
  number?: string           // interne Nummer
  documentNumber?: string   // external (supplier) invoice number
  status?: string
  supplierContactId?: number
  supplierContactName?: string
  receivedDate?: number     // epoch ms
  dueDate?: number          // epoch ms
  currency?: string
  totalGross?: number
  totalNet?: number
  totalVat?: number
  openAmount?: number
  isPaid?: boolean
  [key: string]: unknown
}

function mapStatus(raw: ScopevisioIncomingInvoice): BillStatus {
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'CANCELLED' || s === 'STORNIERT') return 'VOIDED'
  if (raw.isPaid || s === 'PAID' || s === 'BEZAHLT') return 'PAID'
  if (s === 'POSTED' || s === 'GEBUCHT' || s === 'APPROVED') {
    const open = raw.openAmount ?? 0
    const total = raw.totalGross ?? 0
    if (open === 0) return 'PAID'
    if (open > 0 && open < total) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  if (s === 'DRAFT' || s === 'ENTWURF') return 'DRAFT'
  return 'DRAFT'
}

function toDate(epochMs?: number | null): Date | undefined {
  if (!epochMs) return undefined
  return new Date(epochMs)
}

export function transformBill(raw: ScopevisioIncomingInvoice): Bill {
  return {
    id: raw.number ?? (raw.id !== undefined ? String(raw.id) : undefined),
    status: mapStatus(raw),
    billNumber: raw.documentNumber || undefined,
    contactId: raw.supplierContactId !== undefined ? String(raw.supplierContactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalGross ?? undefined,
    taxAmount: raw.totalVat ?? undefined,
    balanceAmount: raw.openAmount ?? undefined,
    postedAt: toDate(raw.receivedDate),
    dueAt: toDate(raw.dueDate),
    metadata: raw as Record<string, unknown>,
  }
}
