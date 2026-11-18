import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, nonempty } from '../../shared/transform'

export interface FacturamaContact {
  Id: string
  Name: string
  Rfc: string
  Email: string
  Phone: string
  Address: {
    Street: string
    ExteriorNumber: string
    InteriorNumber: string
    Neighborhood: string
    ZipCode: string
    Municipality: string
    State: string
    Country: string
  }
  IsActive: boolean
  CurrencyCode: string
  [key: string]: unknown
}

export function transformContact(raw: FacturamaContact): Contact {
  const telephones: Telephone[] = []
  if (raw.Phone) telephones.push({ telephone: raw.Phone, type: 'WORK' })

  const addr = raw.Address
  const address1 = addr
    ? [addr.Street, addr.ExteriorNumber, addr.InteriorNumber].filter(Boolean).join(' ')
    : undefined

  return {
    id: String(raw.Id),
    name: raw.Name || undefined,
    identification: raw.Rfc || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.IsActive,
    currency: raw.CurrencyCode || undefined,
    emails: nonempty(toWorkEmail(raw.Email)),
    telephones: nonempty(telephones),
    billingAddress: addr
      ? toAddress({
          address1,
          city: addr.Municipality,
          region: addr.State,
          postalCode: addr.ZipCode,
          country: addr.Country,
        })
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
