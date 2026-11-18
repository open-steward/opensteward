import type { Bill, BillStatus } from '../../../schema/bill'

export interface ContasimpleBill {
  id: string
  numero: string
  fecha: string
  fecha_vencimiento: string
  base: number
  iva: number
  total: number
  pendiente: number
  estado: string
  proveedor_id: string
  moneda: string
  [key: string]: unknown
}

function mapStatus(estado: string): BillStatus {
  switch (estado) {
    case 'enviada': return 'AUTHORIZED'
    case 'pagada': return 'PAID'
    case 'cancelada': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: ContasimpleBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.estado),
    billNumber: raw.numero || undefined,
    contactId: raw.proveedor_id || undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    taxAmount: raw.iva,
    balanceAmount: raw.pendiente,
    postedAt: raw.fecha ? new Date(raw.fecha) : undefined,
    dueAt: raw.fecha_vencimiento ? new Date(raw.fecha_vencimiento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
