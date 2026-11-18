import { toCalendarDate } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'

export interface ContabiliumBill {
  id: number
  numero: string
  proveedorId: number
  moneda: string
  total: number
  impuestos: number
  saldo: number
  fechaEmision: string
  fechaVencimiento: string
  estado: string
  anulado: boolean
  [key: string]: unknown
}

function mapStatus(raw: ContabiliumBill): BillStatus {
  if (raw.anulado) return 'VOIDED'
  if (raw.estado === 'Pagado' || raw.saldo === 0) return 'PAID'
  if (raw.saldo > 0 && raw.saldo < raw.total) return 'PARTIALLY_PAID'
  if (raw.estado === 'Autorizado') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: ContabiliumBill): Bill {
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

export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    proveedorId: bill.contactId ? Number(bill.contactId) : undefined,
    moneda: bill.currency,
    fechaEmision: toCalendarDate(bill.postedAt),
    fechaVencimiento: toCalendarDate(bill.dueAt),
    total: bill.totalAmount,
    impuestos: bill.taxAmount,
  }
}
