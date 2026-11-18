import type { Contact } from '../../../schema/contact'
import { toWorkEmail, toPhone, toAddress, nonempty } from '../../shared/transform'

export interface SnelStartContact {
  id: string
  naam: string
  vestigingsnaam: string
  kvkNummer: string
  email: string
  telefoon: string
  mobieleTelefoon: string
  adres: {
    straat: string
    postcode: string
    plaats: string
    land: string
  } | null
  relatiesoort: string[]
  [key: string]: unknown
}

export function transformContact(raw: SnelStartContact): Contact {
  const emails = toWorkEmail(raw.email)
  const telephones = [
    toPhone(raw.telefoon, 'WORK'),
    toPhone(raw.mobieleTelefoon, 'MOBILE'),
  ].filter(Boolean) as NonNullable<ReturnType<typeof toPhone>>[]

  const isCustomer = (raw.relatiesoort ?? []).some(
    (s) => s.toLowerCase() === 'klant',
  )
  const isSupplier = (raw.relatiesoort ?? []).some(
    (s) => s.toLowerCase() === 'leverancier',
  )

  return {
    id: raw.id,
    name: raw.naam || undefined,
    companyName: raw.vestigingsnaam || undefined,
    taxNumber: raw.kvkNummer || undefined,
    isCustomer,
    isSupplier,
    isActive: true,
    emails: nonempty(emails),
    telephones: nonempty(telephones),
    billingAddress: toAddress({
      address1: raw.adres?.straat,
      city: raw.adres?.plaats,
      postalCode: raw.adres?.postcode,
      country: raw.adres?.land,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
