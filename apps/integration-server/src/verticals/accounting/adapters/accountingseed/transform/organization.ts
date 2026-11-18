import type { Organization } from '../../../schema/organization'

export interface AccountingSeedOrganization {
  Id: string
  Name: string
  AcctSeed__Legal_Name__c: string
  AcctSeed__Organization_Code__c: string
  AcctSeed__Tax_Id__c: string
  CurrencyIsoCode: string
  AcctSeed__Timezone__c: string
  Website: string
  AcctSeed__Fiscal_Year_End_Month__c: number
  BillingStreet: string
  BillingCity: string
  BillingState: string
  BillingPostalCode: string
  BillingCountry: string
  CreatedDate: string
  LastModifiedDate: string
  [key: string]: unknown
}

export function transformOrganization(raw: AccountingSeedOrganization): Organization {
  return {
    id: raw.Id,
    name: raw.Name || undefined,
    legalName: raw.AcctSeed__Legal_Name__c || undefined,
    organizationCode: raw.AcctSeed__Organization_Code__c || undefined,
    taxNumber: raw.AcctSeed__Tax_Id__c || undefined,
    currency: raw.CurrencyIsoCode || undefined,
    timezone: raw.AcctSeed__Timezone__c || undefined,
    website: raw.Website || undefined,
    fiscalYearEndMonth: raw.AcctSeed__Fiscal_Year_End_Month__c ?? undefined,
    address:
      raw.BillingStreet || raw.BillingCity
        ? {
            address1: raw.BillingStreet || undefined,
            city: raw.BillingCity || undefined,
            region: raw.BillingState || undefined,
            postalCode: raw.BillingPostalCode || undefined,
            country: raw.BillingCountry || undefined,
          }
        : undefined,
    createdAt: raw.CreatedDate ? new Date(raw.CreatedDate) : undefined,
    updatedAt: raw.LastModifiedDate ? new Date(raw.LastModifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
