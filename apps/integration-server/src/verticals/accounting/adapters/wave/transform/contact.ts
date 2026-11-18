import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface WaveContact {
  id: string
  name: string
  firstName: string
  lastName: string
  email: string
  phone: string
  address: {
    addressLine1: string
    city: string
    province: { code: string } | null
    postalCode: string
    country: { code: string } | null
  } | null
  currency: { code: string } | null
  createdAt: string
  modifiedAt: string
  [key: string]: unknown
}

export function transformContact(raw: WaveContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [toPhone(raw.phone, 'WORK')].filter(Boolean) as NonNullable<
    ReturnType<typeof toPhone>
  >[]

  return {
    id: raw.id,
    name: raw.name || undefined,
    firstName: raw.firstName || undefined,
    lastName: raw.lastName || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: true,
    currency: raw.currency?.code || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: raw.address
      ? toAddress({
          address1: raw.address.addressLine1,
          city: raw.address.city,
          region: raw.address.province?.code,
          postalCode: raw.address.postalCode,
          country: raw.address.country?.code,
        })
      : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.modifiedAt ? new Date(raw.modifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
