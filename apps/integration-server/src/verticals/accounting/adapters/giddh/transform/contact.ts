import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface GiddhAccount {
  uniqueName: string
  name: string
  type: string
  email: string
  mobileNo: string
  phone: string
  country: string
  state: string
  pincode: string
  address: string
  isActive: boolean
  currency: string
  [key: string]: unknown
}

export function transformContact(raw: GiddhAccount): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.mobileNo) telephones.push({ telephone: raw.mobileNo, type: 'MOBILE' })
  if (raw.phone) telephones.push({ telephone: raw.phone, type: 'WORK' })

  const isCustomer = raw.type === 'SUNDRYDEBTORS'
  const isSupplier = raw.type === 'SUNDRYCREDITORS'

  return {
    id: raw.uniqueName,
    name: raw.name || undefined,
    isCustomer,
    isSupplier,
    isActive: raw.isActive,
    currency: raw.currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      region: raw.state,
      postalCode: raw.pincode,
      country: toIso3166Alpha2(raw.country),
    }),
    metadata: raw as Record<string, unknown>,
  }
}
