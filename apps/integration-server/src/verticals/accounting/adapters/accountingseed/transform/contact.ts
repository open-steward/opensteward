import type { Contact } from '../../../schema/contact'

export interface AccountingSeedContact {
  Id: string
  Name: string
  FirstName: string
  LastName: string
  AcctSeed__Company_Name__c: string
  AcctSeed__Tax_Id__c: string
  AcctSeed__Customer__c: boolean
  AcctSeed__Vendor__c: boolean
  AcctSeed__Active__c: boolean
  Email: string
  Phone: string
  MobilePhone: string
  MailingStreet: string
  MailingCity: string
  MailingState: string
  MailingPostalCode: string
  MailingCountry: string
  OtherStreet: string
  OtherCity: string
  OtherState: string
  OtherPostalCode: string
  OtherCountry: string
  CurrencyIsoCode: string
  CreatedDate: string
  LastModifiedDate: string
  [key: string]: unknown
}

export function transformContact(raw: AccountingSeedContact): Contact {
  return {
    id: raw.Id,
    name: raw.Name || undefined,
    firstName: raw.FirstName || undefined,
    lastName: raw.LastName || undefined,
    companyName: raw.AcctSeed__Company_Name__c || undefined,
    taxNumber: raw.AcctSeed__Tax_Id__c || undefined,
    isCustomer: raw.AcctSeed__Customer__c ?? undefined,
    isSupplier: raw.AcctSeed__Vendor__c ?? undefined,
    isActive: raw.AcctSeed__Active__c ?? undefined,
    currency: raw.CurrencyIsoCode || undefined,
    emails: raw.Email ? [{ email: raw.Email, type: 'WORK' as const }] : undefined,
    telephones: [
      ...(raw.Phone ? [{ telephone: raw.Phone, type: 'WORK' as const }] : []),
      ...(raw.MobilePhone ? [{ telephone: raw.MobilePhone, type: 'MOBILE' as const }] : []),
    ].length > 0
      ? [
          ...(raw.Phone ? [{ telephone: raw.Phone, type: 'WORK' as const }] : []),
          ...(raw.MobilePhone ? [{ telephone: raw.MobilePhone, type: 'MOBILE' as const }] : []),
        ]
      : undefined,
    billingAddress:
      raw.MailingStreet || raw.MailingCity
        ? {
            address1: raw.MailingStreet || undefined,
            city: raw.MailingCity || undefined,
            region: raw.MailingState || undefined,
            postalCode: raw.MailingPostalCode || undefined,
            country: raw.MailingCountry || undefined,
          }
        : undefined,
    shippingAddress:
      raw.OtherStreet || raw.OtherCity
        ? {
            address1: raw.OtherStreet || undefined,
            city: raw.OtherCity || undefined,
            region: raw.OtherState || undefined,
            postalCode: raw.OtherPostalCode || undefined,
            country: raw.OtherCountry || undefined,
          }
        : undefined,
    createdAt: raw.CreatedDate ? new Date(raw.CreatedDate) : undefined,
    updatedAt: raw.LastModifiedDate ? new Date(raw.LastModifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
