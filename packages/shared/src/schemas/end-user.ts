/**
 * End-user — an external customer who receives a Connect Link from a host
 * business, completes the OAuth/credential flow, and ends up owning a
 * `credentials` row attributed to the host's tenant.
 *
 * Distinct from the admin-DB `users` table (host operators with login
 * accounts). End-users never log in anywhere; they're identified by
 * `(tenant_id, email)` and accessed only by host admins.
 *
 * `pii_data` is encrypted at rest (AES-256-GCM, same `STORE_SECRET`
 * infra as `CredentialStore`). List/search endpoints never return it;
 * detail endpoints return it only when the caller explicitly asked.
 * `personalIdNumber` is masked by default in the admin UI; revealing it
 * writes an audit row.
 */
import { z } from 'zod'
import { Iso3166Alpha2 } from './iso'

export const EndUserAddressSchema = z
  .object({
    line1: z.string().max(200).optional().meta({ example: '2500 Market Street' }),
    line2: z.string().max(200).optional().meta({ example: 'Suite 300' }),
    city: z.string().max(120).optional().meta({ example: 'San Francisco' }),
    region: z.string().max(120).optional().meta({ example: 'CA' }),
    postalCode: z.string().max(40).optional().meta({ example: '94114' }),
    country: Iso3166Alpha2.optional().meta({ example: 'US' }),
  })
  .strict()

export const EndUserPiiSchema = z
  .object({
    firstName: z.string().max(120).optional().meta({ example: 'Jane' }),
    lastName: z.string().max(120).optional().meta({ example: 'Doe' }),
    /** National ID / SSN / passport / fiscal code. Always encrypted; masked by default in the UI. */
    personalIdNumber: z.string().max(80).optional().meta({ example: '••••6789' }),
    /** E.164 phone number, e.g. `+15555550123`. */
    phone: z.string().max(40).optional().meta({ example: '+14155550123' }),
    address: EndUserAddressSchema.optional(),
  })
  .strict()

export const EndUserSchema = z
  .object({
    id: z.string().uuid().meta({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }),
    tenantId: z.string().min(1).meta({ example: 'acme' }),
    email: z.string().email().toLowerCase().meta({ example: 'jane.doe@acme.example' }),
    displayName: z.string().max(200).nullable().optional().meta({ example: 'Jane Doe' }),
    externalReference: z
      .string()
      .max(200)
      .nullable()
      .optional()
      .meta({ example: 'acme-industries' }),
    pii: EndUserPiiSchema.nullable().optional(),
    createdAt: z.number().int().meta({ example: 1768469400000 }),
    updatedAt: z.number().int().meta({ example: 1770301200000 }),
  })
  .strict()

export const CreateEndUserBodySchema = z
  .object({
    tenantId: z.string().min(1).meta({ example: 'acme' }),
    email: z.string().email().toLowerCase().meta({ example: 'jane.doe@acme.example' }),
    displayName: z.string().max(200).optional().meta({ example: 'Jane Doe' }),
    externalReference: z.string().max(200).optional().meta({ example: 'acme-industries' }),
    // Nullable as well as optional: PII is genuinely optional here, and callers
    // that build it from a form send `null` for "the operator filled none of it
    // in". `endUsers.create` takes `pii?: EndUserPii | null` and
    // encryptPii(null) returns null.
    pii: EndUserPiiSchema.nullable().optional(),
  })
  .strict()

export const UpdateEndUserBodySchema = z
  .object({
    displayName: z.string().max(200).nullable().optional().meta({ example: 'Jane Doe' }),
    externalReference: z
      .string()
      .max(200)
      .nullable()
      .optional()
      .meta({ example: 'acme-industries' }),
    pii: EndUserPiiSchema.nullable().optional(),
  })
  .strict()

export type EndUserAddress = z.infer<typeof EndUserAddressSchema>
export type EndUserPii = z.infer<typeof EndUserPiiSchema>
export type EndUser = z.infer<typeof EndUserSchema>
export type CreateEndUserBody = z.infer<typeof CreateEndUserBodySchema>
export type UpdateEndUserBody = z.infer<typeof UpdateEndUserBodySchema>

/**
 * Returns a copy of the PII record with the `personalIdNumber` masked to
 * its last 4 characters. Used by default when the admin UI lists or shows
 * an end-user; the full value is revealed only via the explicit Reveal
 * action (which writes an audit entry).
 */
export function maskPii(pii: EndUserPii | null | undefined): EndUserPii | null {
  if (!pii) return null
  if (!pii.personalIdNumber) return pii
  const last4 = pii.personalIdNumber.slice(-4)
  return { ...pii, personalIdNumber: `••••${last4}` }
}

/** Strips `pii` from a record entirely. Used for list endpoints. */
export function withoutPii<T extends { pii?: unknown }>(record: T): Omit<T, 'pii'> {
  // Intentionally clones to avoid leaking via mutation.
  const { pii: _pii, ...rest } = record as T & { pii?: unknown }
  return rest
}
