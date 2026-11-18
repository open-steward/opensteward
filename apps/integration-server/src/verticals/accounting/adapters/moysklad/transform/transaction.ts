import type { Transaction } from '../../../schema/transaction'

export interface MoyskladTransaction {
  id?: string
  moment?: string
  sum?: number
  currency?: { name?: string }
  description?: string
  name?: string
  account?: { meta?: { href?: string } }
  vatSum?: number
  [key: string]: unknown
}

function getLastSegment(href?: string): string | undefined {
  if (!href) return undefined
  const parts = href.split('/')
  return parts[parts.length - 1] || undefined
}

export function transformTransaction(raw: MoyskladTransaction): Transaction {
  return {
    id: raw.id ? String(raw.id) : '',
    accountId: getLastSegment(raw.account?.meta?.href),
    memo: raw.description || raw.name || undefined,
    currency: raw.currency?.name || undefined,
    totalAmount: raw.sum != null ? raw.sum / 100 : undefined,
    taxAmount: raw.vatSum != null ? raw.vatSum / 100 : undefined,
    createdAt: raw.moment ? new Date(raw.moment) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
