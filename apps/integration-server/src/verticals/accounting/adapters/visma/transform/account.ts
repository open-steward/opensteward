import type { Account, AccountStatus, AccountType } from '../../../schema/account'

export interface VismaAccount {
  Number: string
  Name: string
  IsActive: boolean
  FiscalYearId: string
  Type: number
  TypeDescription: string
  VatCodeId: string
  ModifiedUtc: string
  [key: string]: unknown
}

// Visma account types: 1=Asset, 2=Liability, 3=Equity, 4=Income, 5=Expense
function mapAccountType(type: number): AccountType | undefined {
  switch (type) {
    case 1: return 'ASSET'
    case 2: return 'LIABILITY'
    case 3: return 'EQUITY'
    case 4: return 'INCOME'
    case 5: return 'EXPENSE'
    default: return 'OTHER'
  }
}

export function transformAccount(raw: VismaAccount): Account {
  const status: AccountStatus = raw.IsActive ? 'ACTIVE' : 'ARCHIVED'
  return {
    id: raw.Number,
    name: raw.Name || undefined,
    customerDefinedCode: raw.Number,
    type: mapAccountType(raw.Type),
    status,
    updatedAt: raw.ModifiedUtc ? new Date(raw.ModifiedUtc) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
