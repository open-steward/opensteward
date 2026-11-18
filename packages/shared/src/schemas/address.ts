/**
 * Canonical postal-address schema shared across every vertical.
 *
 * All sub-fields use `nullish()` because upstream platforms legitimately
 * distinguish between "I don't have line 2 for this address" (explicit
 * null in the response) and "this address object came back without a
 * `line2` key at all" (absent). Both are valid.
 *
 * Maximum lengths follow Universal Postal Union recommendations:
 *  - line1/line2 ≤ 255 (street addresses can be long)
 *  - city ≤ 120
 *  - region ≤ 120 (US state, French region, Indian state)
 *  - postalCode ≤ 40 (some Latin American codes are long)
 *  - country uses the shared ISO 3166-1 alpha-2 helper
 */

import { z } from 'zod'

import { Iso3166Alpha2 } from './iso'
import { nullish } from './zod-helpers'

export const AddressSchema = z.object({
  line1: nullish(z.string().max(255).meta({ example: '2500 Market Street' })),
  line2: nullish(z.string().max(255).meta({ example: 'Suite 300' })),
  city: nullish(z.string().max(120).meta({ example: 'San Francisco' })),
  region: nullish(z.string().max(120).meta({ example: 'CA' })),
  postalCode: nullish(z.string().max(40).meta({ example: '94114' })),
  country: nullish(Iso3166Alpha2),
})

export type Address = z.infer<typeof AddressSchema>
