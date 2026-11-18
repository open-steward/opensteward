import type { Address } from '../../../schema/shared'

export interface Locate2uContact {
  name?: string | null
  phone?: string | null
  email?: string | null
}

/**
 * Locate2u stores addresses as a single string and lat/lng coordinates.
 * We map the single `address` string to street1 and carry contact fields through.
 */
export function transformAddress(
  address: string | null | undefined,
  contact?: Locate2uContact | null,
): Address | undefined {
  const hasAddress = address && address.trim() !== ''
  const hasContact =
    contact && (contact.name || contact.phone || contact.email)

  if (!hasAddress && !hasContact) return undefined

  return {
    name: contact?.name ?? undefined,
    street1: address ?? undefined,
    phone: contact?.phone ?? undefined,
    email: contact?.email ?? undefined,
  }
}
