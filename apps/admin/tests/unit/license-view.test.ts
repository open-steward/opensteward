/**
 * The License card and alert, as pure functions of admin-api's GET /api/license
 * answer: no licensing constants of their own (renewalUrl, graceEndsAt come from
 * the answer), the plan shown as it comes, community copy that matches P6.
 */
import { describe, it, expect } from 'vitest'
import { communityNote, describeLicense, licenseAlert } from '../../src/core/license-view'
import type { LicenseStatusRecord } from '../../src/core/proxy/admin-api-client'
import { COMMUNITY, licenseRecord } from '../helpers/license'

const row = (s: LicenseStatusRecord, label: string) =>
  describeLicense(s).rows.find((r) => r.label === label)?.value

describe('licenseAlert', () => {
  it('none without a status, none for VALID', () => {
    expect(licenseAlert(null)).toBeNull()
    expect(licenseAlert(licenseRecord())).toBeNull()
  })

  it.each([
    ['EXPIRING', 'warning'],
    ['GRACE', 'danger'],
    ['DEGRADED', 'danger'],
    ['INVALID', 'danger'],
    ['MISSING', 'warning'],
  ] as const)('%s is %s and links the renewal URL the status carries', (state, tone) => {
    const a = licenseAlert(licenseRecord({ state, renewalUrl: 'https://renew.example.test/x' }))
    expect(a).toMatchObject({ state, tone, href: 'https://renew.example.test/x' })
  })

  it('GRACE names the end of grace admin-api computed; without one, the 30 days', () => {
    const at = licenseAlert(
      licenseRecord({ state: 'GRACE', graceEndsAt: '2026-11-05T17:00:00.000Z' }),
    )
    expect(at?.detail).toContain('Everything keeps working until 2026-11-05')
    const without = licenseAlert(licenseRecord({ state: 'GRACE', graceEndsAt: undefined }))
    expect(without?.detail).toContain('for the 30-day grace period')
  })

  it('EXPIRING never counts negative days', () => {
    expect(licenseAlert(licenseRecord({ state: 'EXPIRING', daysRemaining: -1 }))?.title).toContain(
      'expires in 0 days',
    )
  })

  it('a state a newer integration-server added raises no alert', () => {
    expect(licenseAlert(licenseRecord({ state: 'SUSPENDED' as never }))).toBeNull()
  })
})

describe('describeLicense', () => {
  it('verticals come from vertical: features only, in order', () => {
    const s = licenseRecord({ features: ['mcp', 'vertical:crm', 'sso', 'vertical:accounting'] })
    expect(describeLicense(s).verticals).toEqual(['crm', 'accounting'])
  })

  it('shows the plan as it comes, even one this console has never seen (D-H)', () => {
    expect(row(licenseRecord({ tier: 'team' }), 'Plan')).toBe('team')
  })

  it('labels a state a newer integration-server added with the state itself', () => {
    expect(describeLicense(licenseRecord({ state: 'SUSPENDED' as never }))).toMatchObject({
      state: 'SUSPENDED',
      label: 'SUSPENDED',
      tone: 'warning',
    })
    expect(describeLicense(licenseRecord({ state: 'constructor' as never })).label).toBe(
      'constructor',
    )
  })

  it('Expires: date and days left; the days part drops once negative', () => {
    expect(row(licenseRecord(), 'Expires')).toBe('2027-10-06 (362 days left)')
    const grace = licenseRecord({
      state: 'GRACE',
      daysRemaining: -3,
      expiresAt: '2026-10-06T17:00:00.000Z',
    })
    expect(row(grace, 'Expires')).toBe('2026-10-06')
  })

  it("usage against the limits: connections used of the limit (or 'up to'), tenants counting 'default'", () => {
    expect(row(licenseRecord(), 'Connections')).toBe('3 of 5')
    expect(row(licenseRecord({ usage: { connections: null, tenants: 1 } }), 'Connections')).toBe(
      'up to 5',
    )
    expect(row(licenseRecord(), 'Tenants')).toBe("1 of 1, counting 'default'")
  })

  it('a limit of 1,000,000 or more is Unlimited, as the license service shows it; one less is a number', () => {
    const big = (n: number, usage = { connections: 3 as number | null, tenants: 2 }) =>
      licenseRecord({ limits: { connections: n, tenants: n }, usage })
    expect(row(big(1_000_000), 'Connections')).toBe('Unlimited (3 in use)')
    expect(row(big(1_000_000, { connections: null, tenants: 2 }), 'Connections')).toBe('Unlimited')
    expect(row(big(1_000_000), 'Tenants')).toBe("Unlimited (2 registered, counting 'default')")
    expect(row(big(999_999), 'Connections')).toBe('3 of 999999')
    expect(row(big(999_999), 'Tenants')).toBe("2 of 999999, counting 'default'")
  })

  it.each(['VALID', 'EXPIRING', 'GRACE', 'DEGRADED', 'INVALID', 'MISSING'] as const)(
    "%s: the card's own link is the renewal URL the status carries, never a constant",
    (state) => {
      const card = describeLicense(
        licenseRecord({ state, renewalUrl: 'https://renew.example.test/card' }),
      )
      expect(card.href).toBe('https://renew.example.test/card')
    },
  )

  it('names the license file OPENSTEWARD_LICENSE shadows, and that renewing it changes nothing', () => {
    const shadowed = licenseRecord({
      source: 'env',
      filePath: undefined,
      shadowedFile: '/etc/opensteward/license/license.key',
    })
    expect(describeLicense(shadowed).notes).toEqual([
      'OPENSTEWARD_LICENSE is set, so the license file /etc/opensteward/license/license.key is ignored: renewing that file changes nothing until OPENSTEWARD_LICENSE is unset.',
    ])
    // Without a file behind it, or read from the file itself: no note.
    expect(describeLicense(licenseRecord({ source: 'env', filePath: undefined })).notes).toEqual([])
    expect(describeLicense(licenseRecord()).notes).toEqual([])
  })

  it('says where integration-server read it', () => {
    expect(row(licenseRecord({ source: 'env' }), 'Read from')).toBe(
      'OPENSTEWARD_LICENSE (environment variable)',
    )
    expect(row(licenseRecord(), 'Read from')).toBe('/etc/opensteward/license/license.key')
    expect(
      row(licenseRecord({ state: 'MISSING', source: 'none', ...COMMUNITY }), 'Read from'),
    ).toBe('nothing at /etc/opensteward/license/license.key')
  })

  it('the community note only in community mode, and it says what P6 does', () => {
    expect(describeLicense(licenseRecord()).notes).toEqual([])
    const missing = licenseRecord({ state: 'MISSING', source: 'none', ...COMMUNITY })
    expect(describeLicense(missing).notes).toEqual([communityNote(missing)])
    expect(communityNote(missing)).toBe(
      'Running in community mode: 1 connection and 1 tenant. Connections beyond the first one stay readable and keep syncing; writes through them are refused (LICENSE_LIMIT_EXCEEDED). Nothing is deleted.',
    )
    expect(
      communityNote(licenseRecord({ ...COMMUNITY, limits: { connections: 5, tenants: 1 } })),
    ).toContain('Connections beyond the first 5 stay readable')
  })

  it('notes a development license, a clock behind licensing, the revocation list and a stale status', () => {
    const notes = describeLicense(
      licenseRecord({
        env: 'dev',
        clockRollbackDetected: true,
        revocationList: 'missing',
        stale: true,
        fetchedAt: '2026-10-09T12:00:05.000Z',
      }),
    ).notes.join('\n')
    expect(notes).toContain('Development license: production builds refuse it.')
    expect(notes).toContain('The server clock is behind')
    expect(notes).toContain('no license revocation list, so revoked licenses cannot be detected')
    expect(notes).toContain('Last known status, from 2026-10-09 12:00 UTC')
  })

  it('names each revocation-list problem exactly, and only that revocation goes unchecked (review r9)', () => {
    const noteFor = (revocationList: 'ok' | 'missing' | 'invalid') =>
      describeLicense(licenseRecord({ revocationList })).notes
    expect(noteFor('ok')).toEqual([])
    expect(noteFor('missing')).toEqual([
      'This build carries no license revocation list, so revoked licenses cannot be detected. Upgrade to a current release.',
    ])
    expect(noteFor('invalid')).toEqual([
      "This build's license revocation list did not verify, so revoked licenses cannot be detected. Upgrade to a current release.",
    ])
  })
})
