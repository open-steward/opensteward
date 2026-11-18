import type { Customer } from '../../../schema/customer'
import { toIsoDatetime } from '@opensteward/shared'
import { strMap } from './shared'

/**
 * A Bambora Payment Profile record returned by `GET /v1/profiles/{id}`.
 *
 * Field names follow the Bambora NA Payment Profiles API as reflected in the
 * official Java SDK domain object (bambora-na/beanstream-java PaymentProfile):
 *   - `customer_code`   the profile's unique identifier
 *   - `status`          "A" (active) | "D" (disabled)
 *   - `modified_date`   ISO-like datetime string
 *   - `last_transaction` datetime of last charge
 *   - `language`        "en" | "fr"
 *   - `comments`        free-text merchant notes
 *   - `billing`         nested address / contact object
 */
export interface RawBamboraProfile {
  customer_code?: string
  status?: string
  modified_date?: string
  last_transaction?: string
  language?: string
  comments?: string
  billing?: {
    name?: string
    address_line1?: string
    address_line2?: string
    city?: string
    province?: string
    country?: string
    postal_code?: string
    phone_number?: string
    email_address?: string
  }
  custom?: {
    ref1?: string
    ref2?: string
    ref3?: string
    ref4?: string
    ref5?: string
  }
  [k: string]: unknown
}

export function transformCustomer(raw: RawBamboraProfile): Customer {
  const id = String(raw.customer_code ?? '')
  const b = raw.billing ?? {}
  return {
    id,
    externalId: id,
    email: b.email_address || undefined,
    name: b.name || undefined,
    phone: b.phone_number || undefined,
    billingAddress:
      b.address_line1 || b.city || b.country
        ? {
            line1: b.address_line1 ?? undefined,
            line2: b.address_line2 ?? undefined,
            city: b.city ?? undefined,
            region: b.province ?? undefined,
            postalCode: b.postal_code ?? undefined,
            country: b.country ?? undefined,
          }
        : undefined,
    currency: null,
    description: raw.comments || undefined,
    gateway: 'bambora',
    metadata: strMap({
      status: raw.status,
      language: raw.language,
      last_transaction: raw.last_transaction,
      ref1: raw.custom?.ref1,
      ref2: raw.custom?.ref2,
      ref3: raw.custom?.ref3,
      ref4: raw.custom?.ref4,
      ref5: raw.custom?.ref5,
    }),
    createdAt: undefined,
    updatedAt: toIsoDatetime(raw.modified_date),
    raw,
  }
}
