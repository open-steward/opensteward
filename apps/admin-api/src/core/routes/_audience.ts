/** Request/response schemas for dashboard audiences, shared by the native and Superset routes. */
import { z } from 'zod'
import { RLS_TENANT_ID_RE } from '../analytics/superset-rls'
import { normaliseTenants, type Audience } from '../dashboards/audience'

/** Matches the tenant grants a role or user may hold. */
const MAX_TENANTS = 500

export const TenantIdSchema = z
  .string()
  .max(100)
  .regex(RLS_TENANT_ID_RE)
  .meta({ description: 'Tenant id.', example: 'acme' })

export const AudienceSchema = z
  .object({
    kind: z.enum(['private', 'tenants', 'everyone']).meta({
      description:
        '`private` (only the owner), `tenants` (anyone whose tenant access includes any listed tenant) or `everyone` (every dashboards:view holder; setting it needs dashboards:share_all).',
      example: 'tenants',
    }),
    tenants: z
      .array(TenantIdSchema)
      .max(MAX_TENANTS)
      .optional()
      .meta({
        description: 'For `tenants`: who it is shared with (1–500 tenant ids).',
        example: ['acme'],
      }),
  })
  .refine((a) => a.kind !== 'tenants' || (a.tenants?.length ?? 0) > 0, {
    message: 'Pick at least one tenant to share with.',
    path: ['tenants'],
  })
  .meta({
    id: 'DashboardAudience',
    description: 'Who can see a dashboard.',
    example: { kind: 'tenants', tenants: ['acme'] },
  })

export const PinnedTenantsSchema = z
  .array(TenantIdSchema)
  .max(MAX_TENANTS)
  .nullable()
  .meta({
    id: 'DashboardPinnedTenants',
    description:
      'Limit the data to these tenants (each viewer still sees only tenants in their own access). `null` = every tenant the viewer can see.',
    example: ['acme'],
  })

/**
 * RESPONSE shapes. Deliberately loose: responses are parsed too, and a stored
 * row can hold more tenants than a request may name (migrated from a large
 * grant list) or a corrupt list that reads as empty. Neither may turn a read
 * into a 500.
 */
export const AudienceView = z
  .object({
    kind: z.enum(['private', 'tenants', 'everyone']).meta({
      description: '`private` (only the owner), `tenants` or `everyone`.',
      example: 'tenants',
    }),
    tenants: z
      .array(z.string())
      .optional()
      .meta({
        description:
          'For `tenants`: who it is shared with (limited to your own access unless you may edit it).',
        example: ['acme'],
      }),
  })
  .meta({
    id: 'DashboardAudienceView',
    description: 'Who can see a dashboard, as returned by the API.',
    example: { kind: 'tenants', tenants: ['acme'] },
  })

export const PinnedTenantsView = z
  .array(z.string())
  .nullable()
  .meta({
    id: 'DashboardPinnedTenantsView',
    description: 'Tenants the data is limited to; `null` = every tenant the viewer can see.',
    example: ['acme'],
  })

export function toAudience(a: z.infer<typeof AudienceSchema>): Audience {
  if (a.kind === 'tenants') return { kind: 'tenants', tenants: normaliseTenants(a.tenants ?? []) }
  return { kind: a.kind }
}
