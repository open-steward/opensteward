/**
 * Bill4Time → canonical Contact transform.
 *
 * Bill4Time v2 client fields (from B4T API documentation):
 *   InternalClientID, ClientID, FirstName, LastName, CompanyName,
 *   Email, Phone, MobilePhone, Address, City, State, Zip, Country,
 *   IsActive, Currency, Notes
 */
import type { Contact } from '../../../schema/contact'
import type { Telephone } from '../../../schema/shared'
import { toWorkEmail, toAddress, composeName, nonempty } from '../../shared/transform'

export interface Bill4TimeClient {
  /** System-generated unique identifier */
  InternalClientID?: string | number
  /** User-assigned client code / short ID */
  ClientID?: string
  FirstName?: string
  LastName?: string
  CompanyName?: string
  Email?: string
  Phone?: string
  MobilePhone?: string
  Fax?: string
  Address?: string
  Address2?: string
  City?: string
  State?: string
  Zip?: string
  Country?: string
  IsActive?: boolean
  Currency?: string
  Notes?: string
  [key: string]: unknown
}

export function transformClient(raw: Bill4TimeClient): Contact {
  const id = raw.InternalClientID != null ? String(raw.InternalClientID) : undefined
  const emails = toWorkEmail(raw.Email)
  const telephones: Telephone[] = []
  if (raw.Phone) telephones.push({ telephone: raw.Phone, type: 'WORK' })
  if (raw.MobilePhone) telephones.push({ telephone: raw.MobilePhone, type: 'MOBILE' })
  if (raw.Fax) telephones.push({ telephone: raw.Fax, type: 'FAX' })

  return {
    id,
    name: composeName(raw.CompanyName, raw.FirstName, raw.LastName),
    firstName: raw.FirstName || undefined,
    lastName: raw.LastName || undefined,
    companyName: raw.CompanyName || undefined,
    identification: raw.ClientID || undefined,
    isCustomer: true,
    isSupplier: false,
    isActive: raw.IsActive,
    currency: raw.Currency || undefined,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.Address,
      address2: raw.Address2,
      city: raw.City,
      region: raw.State,
      postalCode: raw.Zip,
      country: raw.Country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
