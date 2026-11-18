/**
 * License fixtures for admin-api tests: integration-server's GET /admin/license
 * body (LicenseStatusUpstream) and fixed providers for buildServer.
 */
import type {
  LicenseFetchFailure,
  LicenseLookup,
  LicenseStatusProvider,
} from '../../src/core/license/status-cache'
import type { LicenseStatusUpstream } from '../../src/core/routes/_openapi'

export function licenseStatusFixture(
  over: Partial<LicenseStatusUpstream> = {},
): LicenseStatusUpstream {
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
    usage: { connections: 3 },
    ...over,
  }
}

export const FETCHED_AT = Date.parse('2026-10-09T12:00:00.000Z')

export function fixedLicense(
  status: LicenseStatusUpstream | null,
  o: { stale?: boolean; failure?: LicenseFetchFailure } = {},
): LicenseStatusProvider {
  return {
    get: async (): Promise<LicenseLookup> => ({
      snapshot: status ? { status, fetchedAt: FETCHED_AT, stale: o.stale ?? false } : null,
      ...(o.failure ? { failure: o.failure } : {}),
    }),
  }
}

/** Suites that are not about licensing: room to spare, so POST /api/tenants is never refused. */
export const PERMISSIVE_TEST_LICENSE = fixedLicense(
  licenseStatusFixture({ limits: { connections: 1000, tenants: 1000 } }),
)
