import { toCalendarDate } from '../../shared/transform'
import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface ColppyCreditMemoItem {
  idItem: number
  descripcion: string
  precioUnitario: number
  cantidad: number
  total: number
  iva: number
  descuento: number
  idCuenta: number
  [key: string]: unknown
}

export interface ColppyCreditMemo {
  idNotaCredito: number
  nroNotaCredito: string
  idCliente: number
  nombreCliente: string
  fechaEmision: string
  fechaVencimiento: string
  total: number
  totalIva: number
  saldo: number
  moneda: string
  contabilizada: boolean
  anulada: boolean
  montoPagado: number
  items: ColppyCreditMemoItem[]
  [key: string]: unknown
}

function mapStatus(cm: ColppyCreditMemo): CreditMemoStatus {
  if (cm.anulada) return 'VOIDED'
  if (cm.contabilizada && cm.saldo === 0) return 'PAID'
  if (cm.contabilizada && cm.saldo > 0 && cm.saldo < Math.abs(cm.total)) return 'PARTIALLY_PAID'
  if (cm.contabilizada) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: ColppyCreditMemoItem): Lineitem {
  return {
    id: String(row.idItem),
    accountId: row.idCuenta ? String(row.idCuenta) : undefined,
    itemDescription: row.descripcion || undefined,
    unitAmount: row.precioUnitario,
    unitQuantity: row.cantidad,
    totalAmount: row.total,
    taxAmount: row.iva,
    discountAmount: row.descuento || undefined,
  }
}

export function transformCreditMemo(raw: ColppyCreditMemo): CreditMemo {
  return {
    id: String(raw.idNotaCredito),
    status: mapStatus(raw),
    creditmemoNumber: raw.nroNotaCredito,
    contactId: raw.idCliente ? String(raw.idCliente) : undefined,
    currency: raw.moneda || undefined,
    totalAmount: raw.total,
    taxAmount: raw.totalIva,
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
    idCliente: cm.contactId ? Number(cm.contactId) : undefined,
    moneda: cm.currency,
    fechaEmision: toCalendarDate(cm.postedAt),
    fechaVencimiento: toCalendarDate(cm.dueAt),
    items: cm.lineItems?.map((li) => ({
      descripcion: li.itemDescription,
      precioUnitario: li.unitAmount,
      cantidad: li.unitQuantity,
      idCuenta: li.accountId ? Number(li.accountId) : undefined,
    })),
  }
}
