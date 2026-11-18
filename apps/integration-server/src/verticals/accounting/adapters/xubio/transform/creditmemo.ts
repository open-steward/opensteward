import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface XubioCreditMemoLine {
  id: number
  productoId: string
  descripcion: string
  precioUnitario: number
  cantidad: number
  total: number
  impuesto: number
  cuentaId: string
  descuento: number
  [key: string]: unknown
}

export interface XubioCreditMemo {
  id: number
  numero: string
  clienteId: number
  fechaEmision: string
  fechaVencimiento: string
  total: number
  impuestos: number
  saldo: number
  montoAbonado: number
  moneda: string
  estado: string
  anulado: boolean
  lineas: XubioCreditMemoLine[]
  [key: string]: unknown
}

function mapStatus(raw: XubioCreditMemo): CreditMemoStatus {
  if (raw.anulado) return 'VOIDED'
  if (raw.estado === 'pagado' || raw.saldo === 0) return 'PAID'
  if (raw.montoAbonado > 0 && raw.saldo > 0) return 'PARTIALLY_PAID'
  if (raw.estado === 'autorizado') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: XubioCreditMemoLine): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuentaId || undefined,
    itemId: row.productoId || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precioUnitario,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
    taxAmount: row.impuesto || undefined,
    discountAmount: row.descuento || undefined,
  }
}

export function transformCreditMemo(raw: XubioCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.numero || undefined,
    contactId: raw.clienteId ? String(raw.clienteId) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    taxAmount: raw.impuestos,
    balanceAmount: raw.saldo,
    paidAmount: raw.montoAbonado || undefined,
    lineItems: (raw.lineas ?? []).map(mapLineitem),
    postedAt: raw.fechaEmision ? new Date(raw.fechaEmision) : undefined,
    dueAt: raw.fechaVencimiento ? new Date(raw.fechaVencimiento) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  return {
    clienteId: cm.contactId ? Number(cm.contactId) : undefined,
    moneda: cm.currency,
    fechaEmision: toCalendarDate(cm.postedAt),
    fechaVencimiento: toCalendarDate(cm.dueAt),
    lineas: cm.lineItems?.map((li) => ({
      productoId: li.itemId,
      descripcion: li.itemDescription,
      precioUnitario: li.unitAmount,
      cantidad: li.unitQuantity,
      cuentaId: li.accountId,
    })),
  }
}
