import type { Carrier } from '../../../schema/carrier'

/**
 * One entry of Packeta's home-delivery carrier list.
 *
 * Fields are the "Data specification" table of
 * https://docs.packeta.com/docs/home-delivery/carriers. The table types the
 * flags as Boolean and `id`/`maxWeight` as Integer, but the page's own
 * "Result JSON" example sends every value as a string (`"id": "80"`,
 * `"available": "true"`), so both spellings are accepted.
 */
export interface PacketaCarrier {
  id?: number | string
  name?: string
  available?: boolean | string
  pickupPoints?: boolean | string
  apiAllowed?: boolean | string
  separateHouseNumber?: boolean | string
  customsDeclarations?: boolean | string
  requiresEmail?: boolean | string
  requiresPhone?: boolean | string
  requiresSize?: boolean | string
  disallowsCod?: boolean | string
  country?: string
  currency?: string
  maxWeight?: number | string
  labelRouting?: string
  labelName?: string
}

/** A documented Boolean flag, sent as `true` or as the string `"true"`. */
function flag(value: unknown): boolean | undefined {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return undefined
}

const FLAGS = [
  'pickupPoints',
  'apiAllowed',
  'separateHouseNumber',
  'customsDeclarations',
  'requiresEmail',
  'requiresPhone',
  'requiresSize',
  'disallowsCod',
] as const

const STRINGS = ['country', 'currency', 'labelRouting', 'labelName'] as const

/**
 * Map one carrier-feed entry to a canonical Carrier.
 *
 * `code` is the carrier id: "For incorporating these carriers into your
 * requests/file import, you would apply the carrier's ID in the same manner
 * as you would use our Packeta pick-up point's ID."
 * `isActive` is `available`: "Indicates whether the carrier is available for
 * delivery." `maxWeight` stays as sent, because the docs name no unit.
 */
export function transformCarrier(raw: PacketaCarrier): Carrier {
  if (raw.id === undefined || raw.id === null || String(raw.id) === '') {
    throw new Error('Packeta carrier feed entry has no id')
  }
  const id = String(raw.id)

  const metadata: Record<string, unknown> = {}
  for (const key of FLAGS) {
    const value = flag(raw[key])
    if (value !== undefined) metadata[key] = value
  }
  for (const key of STRINGS) {
    if (typeof raw[key] === 'string') metadata[key] = raw[key]
  }
  if (raw.maxWeight !== undefined && raw.maxWeight !== null) metadata.maxWeight = raw.maxWeight

  const carrier: Carrier = { id, code: id, metadata }
  if (typeof raw.name === 'string') carrier.name = raw.name
  const available = flag(raw.available)
  if (available !== undefined) carrier.isActive = available
  return carrier
}
