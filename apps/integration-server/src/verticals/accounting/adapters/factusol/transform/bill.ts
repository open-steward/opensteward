/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Bill, BillStatus } from '../../../schema/bill'

export interface FactusolBill {
  id: string
  numero: string
  fecha: string
  fecha_cobro: string
  importe_neto: number
  importe_iva: number
  importe_total: number
  importe_pendiente: number
  estado: number
  proveedor_id: string
  divisa: string
  [key: string]: unknown
}

function mapStatus(estado: number): BillStatus {
  switch (estado) {
    case 1: return 'AUTHORIZED'
    case 2: return 'PAID'
    case 3: return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: FactusolBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.estado),
    billNumber: raw.numero || undefined,
    contactId: raw.proveedor_id || undefined,
    currency: raw.divisa || undefined,
    totalAmount: raw.importe_total,
    taxAmount: raw.importe_iva,
    balanceAmount: raw.importe_pendiente,
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    dueAt: raw.fecha_cobro ? new Date(raw.fecha_cobro) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
