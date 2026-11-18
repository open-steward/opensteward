import { describe, expect, it } from 'vitest'
import { formatLicenseLogLine } from '../../src/licensing/log'
import { communityStatus } from '../../src/licensing/evaluate'
import { TOKEN_AS_FILE_PATH } from '../../src/licensing/source'
import type { LicenseStatus } from '../../src/licensing/types'

const PATH = '/etc/opensteward/license/license.key'
const BASE = {
  source: 'file',
  filePath: PATH,
  clockRollbackDetected: false,
  revocationList: 'missing',
  evaluatedAt: '2026-10-09T12:00:00.000Z',
} as const
const DESCRIBED = {
  licenseId: 'lic_test0001',
  org: 'Acme Forsakring AB',
  tier: 'free',
  label: 'production',
  env: 'prod',
  kid: 'k2026a',
  issuedAt: '2026-10-08T12:00:00Z',
  expiresAt: '2027-10-09T12:00:00Z',
}
const licensed = (state: 'VALID' | 'EXPIRING' | 'GRACE', daysRemaining: number): LicenseStatus => ({
  ...BASE,
  ...DESCRIBED,
  state,
  daysRemaining,
  features: ['mcp'],
  limits: { connections: 5, tenants: 1 },
  entitlementSource: 'license',
})

describe('formatLicenseLogLine', () => {
  it.each<[LicenseStatus, string, RegExp]>([
    [
      licensed('VALID', 365),
      'info',
      /^license VALID: org="Acme Forsakring AB" label="production" tier=free id=lic_test0001; expires 2027-10-09 \(365 days left\)$/,
    ],
    [
      licensed('EXPIRING', 10),
      'warn',
      /^license EXPIRING:.*\(10 days left\)\. Renew at https:\/\/opensteward\.dev\/license$/,
    ],
    [
      licensed('GRACE', -3),
      'error',
      /^license EXPIRED on 2027-10-09:.*Grace period: 27 days left, then this deployment drops to community mode \(1 connection, 1 tenant\)/,
    ],
    [
      communityStatus(BASE, 'DEGRADED', 'EXPIRED', DESCRIBED),
      'error',
      /grace period has ended:.*community mode \(1 connection, 1 tenant\).*nothing is deleted/,
    ],
    [
      communityStatus(BASE, 'INVALID', 'BAD_SIGNATURE'),
      'error',
      /^license INVALID \(BAD_SIGNATURE\)/,
    ],
    [
      communityStatus({ ...BASE, source: 'none' }, 'MISSING'),
      'warn',
      /^no license found \(OPENSTEWARD_LICENSE is unset and \/etc\/opensteward\/license\/license\.key does not exist\)\..*https:\/\/opensteward\.dev\/license$/,
    ],
  ])('%#: level and message', (status, level, message) => {
    const line = formatLicenseLogLine(status)
    expect(line.level).toBe(level)
    expect(line.message).toMatch(message)
  })

  // daysRemaining is floored, so the last day reads 0: say so in words rather
  // than "0 days left" while time remains (review m29).
  it('the last day of grace says "less than a day left", never "0 days left"', () => {
    const { message } = formatLicenseLogLine(licensed('GRACE', -30))
    expect(message).toContain('Grace period: less than a day left, then this deployment drops to')
    expect(message).not.toMatch(/\b0 days\b/)
    expect(formatLicenseLogLine(licensed('GRACE', -29)).message).toContain(
      'Grace period: 1 day left,',
    )
  })
  it('the last day before expiry says "less than a day left" too', () => {
    const { message } = formatLicenseLogLine(licensed('EXPIRING', 0))
    expect(message).toMatch(/; expires 2027-10-09 \(less than a day left\)\. Renew at /)
  })
  it('FILE_UNREADABLE names the path and the fix (Review Focus #1)', () => {
    const { message } = formatLicenseLogLine(communityStatus(BASE, 'INVALID', 'FILE_UNREADABLE'))
    expect(message).toContain(PATH)
    expect(message).toContain('must be readable by uid 1000; mount the directory')
  })
  it('FILE_UNREADABLE for a token pasted as the path says so, and gives the right fix', () => {
    const { message } = formatLicenseLogLine(
      communityStatus({ ...BASE, filePath: TOKEN_AS_FILE_PATH }, 'INVALID', 'FILE_UNREADABLE'),
    )
    expect(message).toMatch(
      /^license INVALID \(FILE_UNREADABLE\): OPENSTEWARD_LICENSE_FILE holds a license token, not a path: put it in OPENSTEWARD_LICENSE instead\. Running in community mode/,
    )
    expect(message).not.toContain('uid 1000')
  })
  it.each(['FILE_TOO_LARGE', 'FILE_EMPTY'] as const)('%s names the path', (reason) => {
    expect(formatLicenseLogLine(communityStatus(BASE, 'INVALID', reason)).message).toContain(PATH)
  })
  it('DEV_KEY_ENV_MISMATCH says which key and which env', () => {
    const { message } = formatLicenseLogLine(
      communityStatus(BASE, 'INVALID', 'DEV_KEY_ENV_MISMATCH', {
        ...DESCRIBED,
        kid: 'devx',
        env: 'prod',
      }),
    )
    expect(message).toMatch(/development key devx.*env "prod"/)
  })
  it('fields carry the status context, and nothing the status does not have', () => {
    const s: LicenseStatus = {
      ...licensed('VALID', 365),
      source: 'env',
      filePath: undefined,
      shadowedFile: '/data/license.key',
    }
    const { fields } = formatLicenseLogLine(s)
    expect(fields.license).toMatchObject({
      state: 'VALID',
      source: 'env',
      shadowedFile: '/data/license.key',
      org: 'Acme Forsakring AB',
      limits: { connections: 5, tenants: 1 },
    })
    expect(Object.keys(fields.license).filter((k) => !(k in s))).toEqual([])
  })
})
