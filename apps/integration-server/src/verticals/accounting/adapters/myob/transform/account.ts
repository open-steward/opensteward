import type { Account, AccountType, AccountStatus } from '../../../schema/account'

export interface MyobAccount {
  UID?: string
  DisplayID?: string
  Name?: string
  Description?: string
  Type?: string
  IsActive?: boolean
  CurrentBalance?: number
  [key: string]: unknown
}

function mapType(type: string | undefined): AccountType {
  const t = (type ?? '').toLowerCase()
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue')) return 'INCOME'
  if (t.includes('expense') || t.includes('cost')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: MyobAccount): Account {
  return {
    id: raw.UID || undefined,
    customerDefinedCode: raw.DisplayID || undefined,
    name: raw.Name || undefined,
    description: raw.Description || undefined,
    type: mapType(raw.Type),
    status: (raw.IsActive === false ? 'ARCHIVED' : 'ACTIVE') as AccountStatus,
    balance: raw.CurrentBalance,
    metadata: raw as Record<string, unknown>,
  }
}
