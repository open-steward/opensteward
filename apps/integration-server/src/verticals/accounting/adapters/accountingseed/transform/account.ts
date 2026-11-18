import type { Account, AccountType, AccountStatus } from '../../../schema/account'

export interface AccountingSeedAccount {
  Id: string
  Name: string
  AcctSeed__Description__c: string
  AcctSeed__Type__c: string
  AcctSeed__Sub_Type_1__c: string
  AcctSeed__Sub_Type_2__c: string
  AcctSeed__Bank__c: boolean
  AcctSeed__Active__c: boolean
  AcctSeed__GL_Account_Number__c: string
  CurrencyIsoCode: string
  AcctSeed__Balance__c: number
  CreatedDate: string
  LastModifiedDate: string
  [key: string]: unknown
}

function mapType(raw: string | undefined): AccountType {
  if (!raw) return 'OTHER'
  const t = raw.toLowerCase()
  if (t.includes('asset')) return 'ASSET'
  if (t.includes('liabilit')) return 'LIABILITY'
  if (t.includes('equity')) return 'EQUITY'
  if (t.includes('revenue') || t.includes('income')) return 'INCOME'
  if (t.includes('expense')) return 'EXPENSE'
  return 'OTHER'
}

function mapStatus(active: boolean | undefined): AccountStatus {
  return active === false ? 'ARCHIVED' : 'ACTIVE'
}

export function transformAccount(raw: AccountingSeedAccount): Account {
  return {
    id: raw.Id,
    name: raw.Name || undefined,
    description: raw.AcctSeed__Description__c || undefined,
    customerDefinedCode: raw.AcctSeed__GL_Account_Number__c || undefined,
    type: mapType(raw.AcctSeed__Type__c),
    status: mapStatus(raw.AcctSeed__Active__c),
    group: raw.AcctSeed__Sub_Type_1__c || undefined,
    subgroup: raw.AcctSeed__Sub_Type_2__c || undefined,
    isPayable: raw.AcctSeed__Bank__c || undefined,
    currency: raw.CurrencyIsoCode || undefined,
    balance: raw.AcctSeed__Balance__c ?? undefined,
    createdAt: raw.CreatedDate ? new Date(raw.CreatedDate) : undefined,
    updatedAt: raw.LastModifiedDate ? new Date(raw.LastModifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
