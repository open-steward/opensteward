import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface MoyskladBillLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  sum?: number
  vat?: number
  account?: { meta?: { href?: string } }
  [key: string]: unknown
}

export interface MoyskladBill {
  id?: string
  name?: string
  moment?: string
  paymentPlannedMoment?: string
  sum?: number
  vatSum?: number
  applicable?: boolean
  agent?: { meta?: { href?: string } }
  currency?: { name?: string }
  positions?: { rows?: MoyskladBillLine[] }
  [key: string]: unknown
}

function mapStatus(applicable?: boolean): BillStatus {
  if (applicable === true) return 'AUTHORIZED'
  return 'DRAFT'
}

function getLastSegment(href?: string): string | undefined {
  if (!href) return undefined
  const parts = href.split('/')
  return parts[parts.length - 1] || undefined
}

export function transformBill(raw: MoyskladBill): Bill {
  return {
    id: raw.id ? String(raw.id) : undefined,
    status: mapStatus(raw.applicable),
    billNumber: raw.name || undefined,
    contactId: getLastSegment(raw.agent?.meta?.href),
    currency: raw.currency?.name || undefined,
    totalAmount: raw.sum != null ? raw.sum / 100 : undefined,
    taxAmount: raw.vatSum != null ? raw.vatSum / 100 : undefined,
    balanceAmount: raw.sum != null ? raw.sum / 100 : undefined,
    postedAt: raw.moment ? new Date(raw.moment) : undefined,
    dueAt: raw.paymentPlannedMoment ? new Date(raw.paymentPlannedMoment) : undefined,
    lineItems: (raw.positions?.rows ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price != null ? l.price / 100 : undefined,
      unitQuantity: l.quantity,
      totalAmount: l.sum != null ? l.sum / 100 : undefined,
      taxAmount: l.vat != null ? l.vat / 100 : undefined,
      accountId: getLastSegment(l.account?.meta?.href),
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
