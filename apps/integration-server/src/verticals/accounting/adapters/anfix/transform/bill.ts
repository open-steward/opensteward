import type { Bill, BillStatus } from '../../../schema/bill'

export interface AnfixBill {
  id: string
  numero_factura: string
  fecha_factura: string
  fecha_vencimiento: string
  base_imponible: number
  cuota_iva: number
  total_factura: number
  pendiente: number
  estado: string
  proveedor_id: string
  divisa: string
  [key: string]: unknown
}

function mapStatus(estado: string): BillStatus {
  switch (estado) {
    case 'emitida': return 'AUTHORIZED'
    case 'cobrada': return 'PAID'
    case 'anulada': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: AnfixBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.estado),
    billNumber: raw.numero_factura || undefined,
    contactId: raw.proveedor_id || undefined,
    currency: raw.divisa || undefined,
    totalAmount: raw.total_factura,
    taxAmount: raw.cuota_iva,
    balanceAmount: raw.pendiente,
    postedAt: raw.fecha_factura ? new Date(raw.fecha_factura) : undefined,
    dueAt: raw.fecha_vencimiento ? new Date(raw.fecha_vencimiento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
