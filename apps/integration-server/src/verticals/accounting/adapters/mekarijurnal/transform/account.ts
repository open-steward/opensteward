import type { Account, AccountType } from '../../../schema/account'

export interface MekariJurnalAccount {
  id: number
  number: string
  name: string
  category: string
  balance: number
  [key: string]: unknown
}

function mapAccountType(category: string): AccountType {
  const lower = (category ?? '').toLowerCase()
  if (lower.includes('asset') || lower.includes('aktiva')) return 'ASSET'
  if (lower.includes('liabilit') || lower.includes('kewajiban') || lower.includes('hutang')) return 'LIABILITY'
  if (lower.includes('equity') || lower.includes('modal')) return 'EQUITY'
  if (lower.includes('income') || lower.includes('pendapatan') || lower.includes('revenue')) return 'INCOME'
  if (lower.includes('expense') || lower.includes('beban') || lower.includes('biaya')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: MekariJurnalAccount): Account {
  return {
    id: String(raw.id),
    name: raw.name || undefined,
    customerDefinedCode: raw.number || undefined,
    type: mapAccountType(raw.category),
    balance: raw.balance,
    metadata: raw as Record<string, unknown>,
  }
}
