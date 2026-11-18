import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface AlegraContact {
  id: number
  name: string
  identification: string
  email: string
  phonePrimary: string
  phoneSecondary: string
  mobile: string
  type: string[]
  status: string
  address: string
  city: string
  department: string
  country: string
  [key: string]: unknown
}

export function transformContact(raw: AlegraContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones: Telephone[] = []
  if (raw.phonePrimary) telephones.push({ telephone: raw.phonePrimary, type: 'WORK' })
  if (raw.phoneSecondary) telephones.push({ telephone: raw.phoneSecondary, type: 'WORK' })
  if (raw.mobile) telephones.push({ telephone: raw.mobile, type: 'MOBILE' })

  const types = raw.type ?? []
  const isCustomer = types.includes('client')
  const isSupplier = types.includes('provider')

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    identification: raw.identification || undefined,
    isCustomer: isCustomer || (!isCustomer && !isSupplier),
    isSupplier,
    isActive: raw.status !== 'inactive',
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.address,
      city: raw.city,
      region: raw.department,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
