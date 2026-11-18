import type { Account, AccountType } from '../../../schema/account'

export interface InvoiceXpressAccount {
  id: number
  name: string
  type: string
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  const t = (type ?? '').toLowerCase()
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue')) return 'INCOME'
  if (t.includes('expense')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: InvoiceXpressAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    type: mapAccountType(raw.type),
    metadata: raw as Record<string, unknown>,
  }
}
