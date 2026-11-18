import type { CreditMemo } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface DolibarrCreditLine {
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

export interface DolibarrCredit {
  id: number | string
  ref?: string
  status?: number | string
  statut?: number | string
  date?: number | string
  total_ht?: number
  total_tva?: number
  total_ttc?: number
  multicurrency_code?: string
  fk_soc?: number | string
  lines?: DolibarrCreditLine[]
  [key: string]: unknown
}

function mapLineitem(line: DolibarrCreditLine): Lineitem {
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

export function transformCreditMemo(raw: DolibarrCredit): CreditMemo {
  return {
    id: String(raw.id),
    creditmemoNumber: raw.ref || undefined,
    contactId: raw.fk_soc !== undefined ? String(raw.fk_soc) : undefined,
    currency: raw.multicurrency_code || undefined,
    totalAmount: raw.total_ttc ?? 0,
    taxAmount: raw.total_tva ?? 0,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(Number(raw.date) * 1000) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
