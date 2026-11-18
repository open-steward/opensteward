import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface ContabiliumCreditMemoItem {
  id: number
  descripcion: string
  cantidad: number
  precioUnitario: number
  total: number
  impuesto: number
  cuentaId: string
  [key: string]: unknown
}

export interface ContabiliumCreditMemo {
  id: number
  numero: string
  clienteId: number
  moneda: string
  total: number
  impuestos: number
  saldo: number
  montoPagado: number
  fechaEmision: string
  fechaVencimiento: string
  estado: string
  anulado: boolean
  items: ContabiliumCreditMemoItem[]
  [key: string]: unknown
}

function mapStatus(raw: ContabiliumCreditMemo): CreditMemoStatus {
  if (raw.anulado) return 'VOIDED'
  if (raw.estado === 'Pagado' || raw.saldo === 0) return 'PAID'
  if (raw.saldo > 0 && raw.saldo < Math.abs(raw.total)) return 'PARTIALLY_PAID'
  if (raw.estado === 'Autorizado') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: ContabiliumCreditMemoItem): Lineitem {
  return {
    id: String(row.id),
    accountId: row.cuentaId || undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precioUnitario,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
    taxAmount: row.impuesto,
  }
}

export function transformCreditMemo(raw: ContabiliumCreditMemo): CreditMemo {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    creditmemoNumber: raw.numero || undefined,
    contactId: raw.clienteId ? String(raw.clienteId) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    taxAmount: raw.impuestos,
    balanceAmount: raw.saldo,
    paidAmount: raw.montoPagado || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
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
    items: cm.lineItems?.map((li) => ({
      descripcion: li.itemDescription,
      precioUnitario: li.unitAmount,
      cantidad: li.unitQuantity,
      cuentaId: li.accountId,
    })),
  }
}
