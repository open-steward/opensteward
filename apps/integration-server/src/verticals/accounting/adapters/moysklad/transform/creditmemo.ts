import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'

export interface MoyskladCreditMemoLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  sum?: number
  vat?: number
  account?: { meta?: { href?: string } }
  [key: string]: unknown
}

export interface MoyskladCreditMemo {
  id?: string
  name?: string
  moment?: string
  paymentPlannedMoment?: string
  sum?: number
  vatSum?: number
  applicable?: boolean
  counterparty?: { meta?: { href?: string } }
  currency?: { name?: string }
  positions?: { rows?: MoyskladCreditMemoLine[] }
  [key: string]: unknown
}

function mapStatus(applicable?: boolean): CreditMemoStatus {
  if (applicable === true) return 'AUTHORIZED'
  return 'DRAFT'
}

function getLastSegment(href?: string): string | undefined {
  if (!href) return undefined
  const parts = href.split('/')
  return parts[parts.length - 1] || undefined
}

export function transformCreditMemo(raw: MoyskladCreditMemo): CreditMemo {
  return {
    id: raw.id ? String(raw.id) : '',
    status: mapStatus(raw.applicable),
    creditmemoNumber: raw.name || undefined,
    contactId: getLastSegment(raw.counterparty?.meta?.href),
    currency: raw.currency?.name || undefined,
    totalAmount: raw.sum != null ? raw.sum / 100 : undefined,
    taxAmount: raw.vatSum != null ? raw.vatSum / 100 : undefined,
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
