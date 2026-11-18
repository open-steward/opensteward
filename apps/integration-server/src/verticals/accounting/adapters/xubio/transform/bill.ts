import type { Bill, BillStatus } from '../../../schema/bill'

export interface XubioBill {
  id: number
  numero: string
  proveedorId: number
  fechaEmision: string
  fechaVencimiento: string
  total: number
  impuestos: number
  saldo: number
  moneda: string
  estado: string
  anulado: boolean
  [key: string]: unknown
}

function mapStatus(raw: XubioBill): BillStatus {
  if (raw.anulado) return 'VOIDED'
  if (raw.estado === 'pagado' || raw.saldo === 0) return 'PAID'
  if (raw.saldo > 0 && raw.saldo < raw.total) return 'PARTIALLY_PAID'
  if (raw.estado === 'autorizado') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: XubioBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.numero || undefined,
    contactId: raw.proveedorId ? String(raw.proveedorId) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    taxAmount: raw.impuestos,
    balanceAmount: raw.saldo,
    postedAt: raw.fechaEmision ? new Date(raw.fechaEmision) : undefined,
    dueAt: raw.fechaVencimiento ? new Date(raw.fechaVencimiento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
