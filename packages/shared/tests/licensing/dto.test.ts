import { describe, expect, it } from 'vitest'
import { LicenseStatusDTOSchema, toLicenseStatusDTO } from '../../src/licensing/dto'
import { communityStatus } from '../../src/licensing/evaluate'
import { LICENSE_INVALID_REASONS, type LicenseStatus } from '../../src/licensing/types'

const BASE = {
  source: 'file',
  filePath: '/data/license.key',
  clockRollbackDetected: false,
  revocationList: 'missing',
  evaluatedAt: '2026-10-09T12:00:00.000Z',
} as const
const VALID: LicenseStatus = {
  ...BASE,
  state: 'VALID',
  licenseId: 'lic_test0001',
  org: 'Acme',
  tier: 'team',
  env: 'staging',
  kid: 'k2026a',
  issuedAt: '2026-10-08T12:00:00Z',
  expiresAt: '2027-10-09T12:00:00Z',
  daysRemaining: 365,
  features: ['mcp'],
  limits: { connections: 5, tenants: 1 },
  entitlementSource: 'license',
}

describe('LicenseStatusDTO (the /admin/license body)', () => {
  it('is the status plus the renewal URL and usage, and validates', () => {
    const dto = toLicenseStatusDTO(VALID, { connections: 3 })
    expect(LicenseStatusDTOSchema.parse(dto)).toEqual(dto)
    expect(dto).toMatchObject({
      renewalUrl: 'https://opensteward.dev/license',
      usage: { connections: 3 },
      tier: 'team',
      env: 'staging',
    })
  })
  it('usage.connections is null when the count is unavailable', () => {
    expect(
      LicenseStatusDTOSchema.parse(toLicenseStatusDTO(VALID, { connections: null })).usage
        .connections,
    ).toBeNull()
  })
  it('copies only the keys the schema declares: a stray status field (a token, say) never reaches the body', () => {
    const stray = { ...VALID, shadowedFile: '/x', token: 'v4.public.SECRETxyz' } as LicenseStatus
    const dto = toLicenseStatusDTO(stray, { connections: 0 })
    expect(Object.keys(dto).filter((k) => !(k in LicenseStatusDTOSchema.shape))).toEqual([])
    expect(dto).toMatchObject({ shadowedFile: '/x', licenseId: 'lic_test0001' })
    expect(JSON.stringify(dto)).not.toContain('v4.public.')
  })
  it('every INVALID reason and every state validates', () => {
    for (const reason of LICENSE_INVALID_REASONS) {
      LicenseStatusDTOSchema.parse(
        toLicenseStatusDTO(communityStatus(BASE, 'INVALID', reason), { connections: null }),
      )
    }
    LicenseStatusDTOSchema.parse(
      toLicenseStatusDTO(communityStatus(BASE, 'MISSING'), { connections: 0 }),
    )
    LicenseStatusDTOSchema.parse(
      toLicenseStatusDTO(communityStatus(BASE, 'DEGRADED', 'EXPIRED'), { connections: 0 }),
    )
  })
  it('an unknown key is stripped, not rejected', () => {
    expect(
      LicenseStatusDTOSchema.parse({
        ...toLicenseStatusDTO(VALID, { connections: 1 }),
        futureField: 1,
      }),
    ).not.toHaveProperty('futureField')
  })
})
