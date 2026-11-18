import type { Account, AccountType } from '../../../schema/account'

export interface FreeAgentAccount {
  url: string
  name: string
  description: string
  type: string
  status: 'Active' | 'Inactive'
  nominal_code: string
  [key: string]: unknown
}

const FA_TYPE_MAP: Record<string, AccountType> = {
  CurrentAsset: 'ASSET',
  FixedAsset: 'ASSET',
  CurrentLiability: 'LIABILITY',
  LongTermLiability: 'LIABILITY',
  Equity: 'EQUITY',
  Income: 'INCOME',
  Sales: 'INCOME',
  CostOfSales: 'EXPENSE',
  Expense: 'EXPENSE',
  Depreciation: 'EXPENSE',
  OtherIncome: 'INCOME',
}

function extractId(url: string): string {
  return url.split('/').pop() ?? url
}

export function transformAccount(raw: FreeAgentAccount): Account {
  return {
    id: extractId(raw.url),
    name: raw.name || undefined,
    description: raw.description || undefined,
    customerDefinedCode: raw.nominal_code || undefined,
    type: FA_TYPE_MAP[raw.type] ?? 'OTHER',
    status: raw.status === 'Active' ? 'ACTIVE' : 'ARCHIVED',
    metadata: raw as Record<string, unknown>,
  }
}
