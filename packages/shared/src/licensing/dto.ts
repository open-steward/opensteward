import { z } from 'zod'
import { LICENSE_INVALID_REASONS, LICENSE_STATES, type LicenseStatus } from './types'
import { LICENSE_RENEWAL_URL } from './urls'

const count = z.number().int().nonnegative()

/**
 * The `data` of GET /admin/license (canonical): the status, plus renewalUrl and
 * usage. Times are ISO-8601; tier and env are the token's lenient slugs (D-H).
 * admin-api's LicenseStatusUpstream must accept this shape (a compile-time
 * check in its status-cache.ts) and strips any key it does not know. There is
 * no token field, and toLicenseStatusDTO copies only the keys declared here.
 */
export const LicenseStatusDTOSchema = z.object({
  state: z.enum(LICENSE_STATES),
  reason: z.enum([...LICENSE_INVALID_REASONS, 'EXPIRED']).optional(),
  source: z.enum(['env', 'file', 'none']),
  filePath: z.string().optional(),
  shadowedFile: z.string().optional(),
  licenseId: z.string().optional(),
  org: z.string().optional(),
  tier: z.string().optional(),
  label: z.string().optional(),
  env: z.string().optional(),
  kid: z.string().optional(),
  features: z.array(z.string()),
  limits: z.object({ connections: count, tenants: count }),
  issuedAt: z.iso.datetime().optional(),
  expiresAt: z.iso.datetime().optional(),
  daysRemaining: z.number().int().optional(),
  entitlementSource: z.enum(['license', 'community']),
  clockRollbackDetected: z.boolean(),
  revocationList: z.enum(['ok', 'missing', 'invalid']),
  evaluatedAt: z.iso.datetime(),
  renewalUrl: z.url(),
  usage: z.object({ connections: count.nullable() }),
})
export type LicenseStatusDTO = z.infer<typeof LicenseStatusDTOSchema>

/** The status keys a DTO carries: the schema's, minus the two the DTO adds itself. */
const STATUS_KEYS = Object.keys(LicenseStatusDTOSchema.shape).filter(
  (k) => k !== 'renewalUrl' && k !== 'usage',
)

/**
 * Key by key from the schema, never a spread of the status: a field added to
 * LicenseStatus later, or a stray one at runtime, reaches the HTTP body only
 * once the schema declares it. The router sends this object as it is, unparsed.
 */
export function toLicenseStatusDTO(
  s: LicenseStatus,
  usage: { connections: number | null },
): LicenseStatusDTO {
  const source = s as unknown as Readonly<Record<string, unknown>>
  const picked = Object.fromEntries(
    STATUS_KEYS.filter((k) => source[k] !== undefined).map((k) => [k, source[k]]),
  )
  return {
    ...picked,
    features: [...s.features],
    limits: { connections: s.limits.connections, tenants: s.limits.tenants },
    renewalUrl: LICENSE_RENEWAL_URL,
    usage: { connections: usage.connections },
  } as LicenseStatusDTO
}
