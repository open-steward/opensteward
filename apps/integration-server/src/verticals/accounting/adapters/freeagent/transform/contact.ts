import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toAddress, composeName, nonempty } from '../../shared/transform'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface FreeAgentContact {
  url: string
  organisation_name: string
  first_name: string
  last_name: string
  email: string
  phone_number: string
  mobile: string
  billing_email: string
  is_active: boolean
  account_balance: string
  status: 'Active' | 'Inactive'
  address1: string
  address2: string
  town: string
  region: string
  postcode: string
  country: string
  [key: string]: unknown
}

function extractId(url: string): string {
  return url.split('/').pop() ?? url
}

export function transformContact(raw: FreeAgentContact): Contact {
  // FreeAgent can have both a primary and a billing email
  const emailList = [
    ...(raw.email ? [{ email: raw.email, type: 'WORK' as const }] : []),
    ...(raw.billing_email && raw.billing_email !== raw.email
      ? [{ email: raw.billing_email, type: 'WORK' as const }]
      : []),
  ]

  const telephones: Telephone[] = []
  if (raw.phone_number) telephones.push({ telephone: raw.phone_number, type: 'WORK' })
  if (raw.mobile) telephones.push({ telephone: raw.mobile, type: 'MOBILE' })

  return {
    id: extractId(raw.url),
    name: composeName(raw.organisation_name, raw.first_name, raw.last_name),
    firstName: raw.first_name || undefined,
    lastName: raw.last_name || undefined,
    companyName: raw.organisation_name || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.status === 'Active',
    emails: nonempty(emailList),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address1,
      address2: raw.address2,
      city: raw.town,
      postalCode: raw.postcode,
      country: toIso3166Alpha2(raw.country),
    }),
    metadata: raw as Record<string, unknown>,
  }
}
