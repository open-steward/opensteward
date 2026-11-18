import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface DolibarrSupplierInvoiceLine {
  id?: number | string
  fk_product?: number | string
  product_label?: string
  desc?: string
  qty?: number
  subprice?: number
  total_ht?: number
  total_tva?: number
  total_ttc?: number
  tva_tx?: number
  fk_account?: number | string
  [key: string]: unknown
}

export interface DolibarrSupplierInvoice {
  id: number | string
  ref?: string
  ref_supplier?: string
  status?: number | string
  statut?: number | string
  date?: number | string
  date_echeance?: number | string
  total_ht?: number
  total_tva?: number
  total_ttc?: number
  remaintopay?: number
  multicurrency_code?: string
  fk_soc?: number | string
  lines?: DolibarrSupplierInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status?: number | string): BillStatus {
  const s = Number(status)
  switch (s) {
    case 0:
      return 'DRAFT'
    case 1:
      return 'SUBMITTED'
    case 2:
      return 'AUTHORIZED'
    case 3:
      return 'DELETED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: DolibarrSupplierInvoiceLine): Lineitem {
  return {
    itemId: line.fk_product !== undefined ? String(line.fk_product) : undefined,
    itemDescription: line.product_label || line.desc || undefined,
    unitAmount: line.subprice,
    unitQuantity: line.qty,
    totalAmount: line.total_ttc ?? line.total_ht ?? 0,
    taxAmount: line.total_tva || undefined,
    taxrateId: line.tva_tx ? String(line.tva_tx) : undefined,
    accountId: line.fk_account !== undefined ? String(line.fk_account) : undefined,
  }
}

export function transformBill(raw: DolibarrSupplierInvoice): Bill {
  const status = raw.status ?? raw.statut
  return {
    id: String(raw.id),
    billNumber: raw.ref || raw.ref_supplier || undefined,
    status: mapStatus(status),
    contactId: raw.fk_soc !== undefined ? String(raw.fk_soc) : undefined,
    currency: raw.multicurrency_code || undefined,
    totalAmount: raw.total_ttc ?? 0,
    taxAmount: raw.total_tva ?? 0,
    balanceAmount: raw.remaintopay,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(Number(raw.date) * 1000) : undefined,
    dueAt: raw.date_echeance ? new Date(Number(raw.date_echeance) * 1000) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
