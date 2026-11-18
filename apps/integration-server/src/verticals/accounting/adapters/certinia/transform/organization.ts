import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

export interface CertiniaOrganization {
  Id: string
  Name: string
  TaxId__c: string
  BillingStreet: string
  BillingCity: string
  BillingState: string
  BillingPostalCode: string
  BillingCountry: string
  Phone: string
  Email__c: string
  [key: string]: unknown
}

export function transformOrganization(raw: CertiniaOrganization): Organization {
  return {
    name: raw.Name || undefined,
    legalName: raw.Name || undefined,
    taxNumber: raw.TaxId__c || undefined,
    address: toAddress({
      address1: raw.BillingStreet,
      city: raw.BillingCity,
      region: raw.BillingState,
      postalCode: raw.BillingPostalCode,
      country: raw.BillingCountry,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
