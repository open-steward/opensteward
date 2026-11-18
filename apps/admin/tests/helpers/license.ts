/**
 * A full GET /api/license record (admin-api's LicenseStatus component) for console
 * tests, and the overrides that turn it into community mode.
 */
import type { LicenseStatusRecord } from '../../src/core/proxy/admin-api-client'

export function licenseRecord(over: Partial<LicenseStatusRecord> = {}): LicenseStatusRecord {
  return {
    state: 'VALID',
    source: 'file',
    filePath: '/etc/opensteward/license/license.key',
    licenseId: 'lic_8f3k2a9x',
    org: 'Acme Forsakring AB',
    tier: 'free',
    label: 'production',
    env: 'prod',
    kid: 'k2026a',
    features: ['mcp', 'vertical:accounting', 'vertical:crm'],
    limits: { connections: 5, tenants: 1 },
    issuedAt: '2026-10-06T17:00:00.000Z',
    expiresAt: '2027-10-06T17:00:00.000Z',
    daysRemaining: 362,
    entitlementSource: 'license',
    clockRollbackDetected: false,
    revocationList: 'ok',
    evaluatedAt: '2026-10-09T12:00:00.000Z',
    renewalUrl: 'https://opensteward.dev/license',
    usage: { connections: 3, tenants: 1 },
    graceEndsAt: '2027-11-05T17:00:00.000Z',
    stale: false,
    fetchedAt: '2026-10-09T12:00:00.000Z',
    ...over,
  }
}

/** Community mode (MISSING, INVALID, DEGRADED): the community limits, no license details. */
export const COMMUNITY: Partial<LicenseStatusRecord> = {
  entitlementSource: 'community',
  limits: { connections: 1, tenants: 1 },
  licenseId: undefined,
  org: undefined,
  tier: undefined,
  label: undefined,
  env: undefined,
  kid: undefined,
  issuedAt: undefined,
  expiresAt: undefined,
  daysRemaining: undefined,
  graceEndsAt: undefined,
}
