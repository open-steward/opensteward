import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface SellsyAccount {
  id: string
  name: string
  description: string
  number: string
  type: string
  is_archived: boolean
  currency: string
  group: string
  [key: string]: unknown
}

function mapType(acc: SellsyAccount): AccountType {
  const t = acc.type?.toLowerCase() ?? ''
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity') || t.includes('capital')) return 'EQUITY'
  if (t.includes('revenue') || t.includes('income') || t.includes('produit')) return 'INCOME'
  if (t.includes('expense') || t.includes('charge')) return 'EXPENSE'
  // French plan comptable: classes 1-5 = balance sheet, 6 = expense, 7 = income
  const code = acc.number ?? ''
  if (code.startsWith('1')) return 'EQUITY'
  if (code.startsWith('2') || code.startsWith('3') || code.startsWith('5')) return 'ASSET'
  if (code.startsWith('4')) return 'LIABILITY'
  if (code.startsWith('6')) return 'EXPENSE'
  if (code.startsWith('7')) return 'INCOME'
  return 'OTHER'
}

export function transformAccount(raw: SellsyAccount): Account {
  const status: AccountStatus = raw.is_archived ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.id,
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.number || undefined,
    type: mapType(raw),
    status,
    group: raw.group || undefined,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
