import type { SalesOrder } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'
import type { DolibarrOrder, DolibarrOrderLine } from './order'

function mapLineitem(line: DolibarrOrderLine): Lineitem {
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

export function transformSalesOrder(raw: DolibarrOrder): SalesOrder {
  return {
    id: String(raw.id),
    contactId: raw.fk_soc !== undefined ? String(raw.fk_soc) : undefined,
    currency: raw.multicurrency_code || undefined,
    totalAmount: raw.total_ttc ?? 0,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(Number(raw.date) * 1000) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
