import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface SnelStartAccount {
  id: string
  nummer: number
  omschrijving: string
  rekeningCode: string
  nonactief: boolean
  [key: string]: unknown
}

function mapType(acc: SnelStartAccount): AccountType {
  const code = acc.rekeningCode?.toUpperCase() ?? ''
  if (code.includes('ACTIVA') || code.includes('ASSET') || code.includes('BALANS_ACTIVA')) return 'ASSET'
  if (code.includes('PASSIVA') || code.includes('LIABILIT') || code.includes('BALANS_PASSIVA')) return 'LIABILITY'
  if (code.includes('EIGEN_VERMOGEN') || code.includes('EQUITY')) return 'EQUITY'
  if (code.includes('OMZET') || code.includes('INCOME') || code.includes('REVENUE')) return 'INCOME'
  if (code.includes('KOSTEN') || code.includes('EXPENSE')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: SnelStartAccount): Account {
  const status: AccountStatus = raw.nonactief ? 'ARCHIVED' : 'ACTIVE'
  return {
    id: raw.id,
    name: raw.omschrijving || undefined,
    customerDefinedCode: raw.nummer != null ? String(raw.nummer) : undefined,
    type: mapType(raw),
    status,
    metadata: raw as Record<string, unknown>,
  }
}
