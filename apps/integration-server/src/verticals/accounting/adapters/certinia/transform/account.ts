import type { Account, AccountType } from '../../../schema/account'
import { parseDecimal } from '../../shared/transform'

export interface CertiniaAccount {
  Id: string
  Name: string
  Account_Code__c: string
  Type__c: string
  Balance__c: number | string
  IsActive__c: boolean
  [key: string]: unknown
}

function mapAccountType(type: string): AccountType {
  const t = (type ?? '').toLowerCase()
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity') || t.includes('capital')) return 'EQUITY'
  if (t.includes('income') || t.includes('revenue')) return 'INCOME'
  if (t.includes('expense') || t.includes('cost')) return 'EXPENSE'
  return 'OTHER'
}

export function transformAccount(raw: CertiniaAccount): Account {
  return {
    id: String(raw.Id),
    name: raw.Name || undefined,
    customerDefinedCode: raw.Account_Code__c || undefined,
    type: mapAccountType(raw.Type__c),
    balance: parseDecimal(raw.Balance__c),
    status: raw.IsActive__c ? 'ACTIVE' : 'ARCHIVED',
    metadata: raw as Record<string, unknown>,
  }
}
