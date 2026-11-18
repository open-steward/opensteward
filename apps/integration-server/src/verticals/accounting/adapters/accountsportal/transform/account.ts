import type { Account, AccountType } from '../../../schema/account'
import { toMinorUnits } from '../../shared/transform'

// AccountsPortal chart-of-accounts entry wire shape
export interface APAccount {
  id: number
  name: string
  description: string | null
  nominal_code: string | null
  account_type: string    // e.g. 'income', 'expense', 'asset', 'liability', 'equity'
  is_active: boolean
  currency: string | null
  balance: number | null
  [key: string]: unknown
}

function mapType(raw: APAccount): AccountType {
  const t = (raw.account_type ?? '').toLowerCase()
  if (t.includes('asset') || t.includes('bank') || t.includes('cash') || t.includes('debtor') || t.includes('receivable')) return 'ASSET'
  if (t.includes('liabilit') || t.includes('creditor') || t.includes('payable')) return 'LIABILITY'
  if (t.includes('equity') || t.includes('capital') || t.includes('retained')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue') || t.includes('sales') || t.includes('turnover')) return 'INCOME'
  if (t.includes('expense') || t.includes('cost') || t.includes('overhead') || t.includes('purchase')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: APAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.nominal_code || undefined,
    type: mapType(raw),
    status: raw.is_active ? 'ACTIVE' : 'ARCHIVED',
    currency: raw.currency || undefined,
    balance: toMinorUnits(raw.balance),
    metadata: raw as Record<string, unknown>,
  }
}
