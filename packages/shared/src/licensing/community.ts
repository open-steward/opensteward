import { VERTICALS } from '@opensteward/license-token'
import type { LicenseLimits } from './types'

/** Built-in entitlements for MISSING, INVALID and DEGRADED (handover D7): every current vertical and mcp, 1 connection, 1 tenant. */
export const COMMUNITY_ENTITLEMENTS: {
  readonly features: readonly string[]
  readonly limits: LicenseLimits
} = Object.freeze({
  features: Object.freeze(['mcp', ...VERTICALS.map((v) => `vertical:${v}`)]),
  limits: Object.freeze({ connections: 1, tenants: 1 }),
})
