import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface PandleAccount {
  id: number
  name: string
  description: string
  nominal_code: string
  category: string
  is_locked: boolean
  is_visible: boolean
  currency: string
  [key: string]: unknown
}

function mapType(acc: PandleAccount): AccountType {
  const cat = acc.category?.toLowerCase() ?? ''
  if (cat.includes('asset') || cat.includes('bank') || cat.includes('cash')
      || cat.includes('debtor') || cat.includes('fixed_asset')) return 'ASSET'
  if (cat.includes('liabilit') || cat.includes('creditor')) return 'LIABILITY'
  if (cat.includes('equity') || cat.includes('capital') || cat.includes('retained')) return 'EQUITY'
  if (cat.includes('expense') || cat.includes('cost') || cat.includes('overhead')
      || cat.includes('purchase')) return 'EXPENSE'
  if (cat.includes('revenue') || cat.includes('income') || cat.includes('sales')
      || cat.includes('turnover')) return 'INCOME'
  return 'OTHER'
}

export function transformAccount(raw: PandleAccount): Account {
  const status: AccountStatus = raw.is_visible === false ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.nominal_code || undefined,
    type: mapType(raw),
    status,
    currency: raw.currency || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
