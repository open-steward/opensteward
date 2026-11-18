/**
 * ConnectSession — single-use, time-bound link sent to an end-customer
 * so they can authorise an integration on behalf of the host business
 * without going through the host's product-side onboarding.
 *
 * The token in `connect_sessions.token` is the URL-safe secret. The id is
 * what admins reference. Once a connection lands, `consumed_at` and
 * `connection_id` are populated and the session can no longer be reused.
 */
import { z } from 'zod'
import { SyncScheduleSchema } from '../data-store/sync-schedule'

export const ConnectAllowedPlatformSchema = z
  .object({
    vertical: z.string().min(1).meta({ example: 'payments' }),
    slug: z.string().min(1).meta({ example: 'stripe' }),
  })
  .strict()

export const ConnectSessionStatusSchema = z.enum(['active', 'consumed', 'expired'])

export const ConnectSessionSchema = z
  .object({
    id: z.string().uuid().meta({ example: '3f1a9c2e-5b6d-4e8f-9a0b-1c2d3e4f5a6b' }),
    /** Opaque token used in the public URL. Never logged. */
    token: z.string().min(32).meta({ example: 'cs_live_9aXbYcZd0E1f2G3h4I5j6K7l8M9n0O1p' }),
    tenantId: z.string().min(1).meta({ example: 'acme' }),
    endUserId: z
      .string()
      .uuid()
      .nullable()
      .meta({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }),
    label: z.string().max(200).meta({ example: 'Acme Industries onboarding' }),
    /** Empty array ⇒ any enabled vertical. */
    allowedVerticals: z
      .array(z.string().min(1))
      .default([])
      .meta({ example: ['payments'] }),
    /** Empty array ⇒ any enabled adapter (within `allowedVerticals` if set). */
    allowedPlatforms: z
      .array(ConnectAllowedPlatformSchema)
      .default([])
      .meta({ example: [{ vertical: 'payments', slug: 'stripe' }] }),
    redirectUrl: z
      .string()
      .url()
      .nullable()
      .meta({ example: 'https://app.acme.example/integrations/callback' }),
    expiresAt: z.number().int().meta({ example: 1770301200000 }),
    consumedAt: z.number().int().nullable().meta({ example: 1768469400000 }),
    connectionId: z
      .string()
      .uuid()
      .nullable()
      .meta({ example: '1b9d6bcd-bf5c-4a3e-9b2a-2f4e8c7d1a90' }),
    createdAt: z.number().int().meta({ example: 1768469400000 }),
    createdBy: z.string().nullable().meta({ example: 'usr_3Kp9Wd' }),
    status: ConnectSessionStatusSchema.meta({ example: 'active' }),
    /** The sync schedule the connection this link creates starts with; null = the deployment default. */
    syncSchedule: SyncScheduleSchema.nullable().optional().meta({ example: null }),
  })
  .strict()

export const CreateConnectSessionBodySchema = z
  .object({
    tenantId: z.string().min(1).meta({ example: 'acme' }),
    label: z.string().min(1).max(200).meta({ example: 'Acme Industries onboarding' }),
    /** Existing end-user id; mutually exclusive with `customerEmail`. */
    endUserId: z
      .string()
      .uuid()
      .optional()
      .meta({ example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }),
    /**
     * If given without `endUserId`, the server resolves-or-creates an
     * end-user from `(tenantId, email)` and binds the session to it.
     */
    customerEmail: z.string().email().optional().meta({ example: 'jane.doe@acme.example' }),
    customerDisplayName: z.string().max(200).optional().meta({ example: 'Jane Doe' }),
    allowedVerticals: z
      .array(z.string().min(1))
      .optional()
      .meta({ example: ['payments'] }),
    allowedPlatforms: z
      .array(ConnectAllowedPlatformSchema)
      .optional()
      .meta({ example: [{ vertical: 'payments', slug: 'stripe' }] }),
    redirectUrl: z
      .string()
      .url()
      .optional()
      .meta({ example: 'https://app.acme.example/integrations/callback' }),
    /** Expiry in epoch ms. Defaults to the `connect_link.default_expiry_hours` runtime setting (72h out of the box). */
    expiresAt: z.number().int().optional().meta({ example: 1770301200000 }),
    /** When true, the connection produced by this session is auto-deleted
     *  after the post-OAuth sync completes. Pair with a read-only scope
     *  group on the platform's configure page so the OAuth grant is
     *  provider-enforced read-only. */
    oneTimeOnly: z.boolean().optional().meta({ example: false }),
    /** The sync schedule the connection made through this link starts with.
     *  Omit for the deployment default. A one-time link (`oneTimeOnly`) always
     *  makes a `once` connection, so any other mode alongside it is refused. */
    syncSchedule: SyncScheduleSchema.optional(),
    /** Per-link OAuth scope override, used when `scopePolicy` is 'custom'. Omit
     *  otherwise. */
    scopes: z
      .array(z.string().min(1))
      .optional()
      .meta({ example: ['read_charges', 'read_customers'] }),
    /** How scopes are decided for this link, resolved per-platform at
     *  OAuth-start: 'read_only' (read scopes, fall back to platform default),
     *  'platform_default' (no override), or 'custom' (use `scopes`). */
    scopePolicy: z
      .enum(['read_only', 'platform_default', 'custom'])
      .optional()
      .meta({ example: 'read_only' }),
    /** When true, the customer-facing landing page renders an email-capture
     *  form before the picker. Used in the "self-register" mint mode where
     *  the admin doesn't yet know the customer's email. */
    allowSelfRegister: z.boolean().optional().meta({ example: false }),
    /** UUID of the admin user who minted the link (stamped by admin-api
     *  from the JWT before forwarding). Recorded as `created_by` on the
     *  session row for audit. Trusted because /admin/* is X-Admin-Secret-
     *  gated. */
    createdBy: z.string().nullable().optional().meta({ example: 'usr_3Kp9Wd' }),
  })
  .strict()

export type ConnectAllowedPlatform = z.infer<typeof ConnectAllowedPlatformSchema>
export type ConnectSessionStatus = z.infer<typeof ConnectSessionStatusSchema>
export type ConnectSession = z.infer<typeof ConnectSessionSchema>
export type CreateConnectSessionBody = z.infer<typeof CreateConnectSessionBodySchema>

export function deriveStatus(
  row: {
    consumedAt: number | null
    expiresAt: number
  },
  now: number = Date.now(),
): ConnectSessionStatus {
  if (row.consumedAt) return 'consumed'
  if (row.expiresAt <= now) return 'expired'
  return 'active'
}
