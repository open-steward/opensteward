import { toCalendarDate } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'

export interface ColppyBill {
  idFacturaProveedor: number
  nroFactura: string
  idProveedor: number
  nombreProveedor: string
  total: number
  iva: number
  saldo: number
  moneda: string
  fechaEmision: string
  fechaVencimiento: string
  estado: string
  anulada: boolean
  [key: string]: unknown
}

function mapStatus(raw: ColppyBill): BillStatus {
  if (raw.anulada) return 'VOIDED'
  if (raw.saldo === 0 && raw.total > 0) return 'PAID'
  if (raw.saldo > 0 && raw.saldo < raw.total) return 'PARTIALLY_PAID'
  if (raw.estado === 'autorizada') return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: ColppyBill): Bill {
  return {
    id: String(raw.idFacturaProveedor),
    status: mapStatus(raw),
    billNumber: raw.nroFactura || undefined,
    contactId: raw.idProveedor ? String(raw.idProveedor) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    taxAmount: raw.iva,
    balanceAmount: raw.saldo,
    postedAt: raw.fechaEmision ? new Date(raw.fechaEmision) : undefined,
    dueAt: raw.fechaVencimiento ? new Date(raw.fechaVencimiento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformBill(bill: Partial<Bill>): Record<string, unknown> {
  return {
    idProveedor: bill.contactId ? Number(bill.contactId) : undefined,
    moneda: bill.currency,
    fechaEmision: toCalendarDate(bill.postedAt),
    fechaVencimiento: toCalendarDate(bill.dueAt),
  }
}
