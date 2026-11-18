import type { Account, AccountStatus, AccountType } from '../../../schema/account'

// QuickFile nominal ledger account (from Ledger_GetNominalLedgers)
export interface QuickFileNominalLedger {
  NominalCode: number
  Name?: string
  Description?: string
  CategoryGroupID?: number
  CategoryGroupName?: string
  // QuickFile nominal code ranges roughly map to account types:
  // 0000-0999: Fixed Assets
  // 1000-1999: Current Assets
  // 2000-2999: Liabilities
  // 3000-3999: Equity / Capital
  // 4000-4999: Income/Sales
  // 5000-7999: Expenses/Costs
  // 8000-9999: Other
  [key: string]: unknown
}

function mapAccountType(code: number): AccountType {
  if (code < 1000) return 'ASSET'
  if (code < 2000) return 'ASSET'
  if (code < 3000) return 'LIABILITY'
  if (code < 4000) return 'EQUITY'
  if (code < 5000) return 'INCOME'
  if (code < 8000) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: QuickFileNominalLedger): Account {
  const status: AccountStatus = 'ACTIVE'
  const code = String(raw.NominalCode)
  return {
    id: code,
    name: raw.Name || undefined,
    description: raw.Description || undefined,
    customerDefinedCode: code,
    type: mapAccountType(raw.NominalCode),
    status,
    group: raw.CategoryGroupName || undefined,
    metadata: raw as Record<string, unknown>,
  }
}
