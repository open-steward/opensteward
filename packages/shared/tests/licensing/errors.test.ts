import { describe, expect, it } from 'vitest'
import {
  LICENSE_ERROR_CODES,
  LicenseError,
  connectionReadOnlyRefusal,
  featureRefusal,
  isLicenseError,
  licenseErrorBody,
  limitRefusal,
  publicRefusalBody,
} from '../../src/licensing/errors'
import type { LicenseState } from '../../src/licensing/types'

const st = (state: LicenseState) => ({ state })

describe('featureRefusal (P3)', () => {
  it.each(['VALID', 'EXPIRING', 'GRACE'] as const)(
    '%s → LICENSE_FEATURE_NOT_ENTITLED naming the feature',
    (s) => {
      const e = featureRefusal(st(s), 'vertical:crm')
      expect(e.code).toBe('LICENSE_FEATURE_NOT_ENTITLED')
      expect(e.message).toContain("'vertical:crm'")
      expect(e.details).toEqual({ feature: 'vertical:crm' })
    },
  )
  it('DEGRADED → LICENSE_EXPIRED, exactly "Renew at <url>" (unit only: unreachable over HTTP in v1)', () => {
    expect(featureRefusal(st('DEGRADED'), 'sso').toBody()).toEqual({
      error: {
        code: 'LICENSE_EXPIRED',
        message: 'Renew at https://opensteward.dev/license',
        feature: 'sso',
      },
    })
  })
  // The signup and renewal URLs are the same address, so the URL alone cannot
  // tell the two wordings apart: pin both texts (review m28).
  it.each(['MISSING', 'INVALID'] as const)(
    '%s → LICENSE_FEATURE_NOT_ENTITLED pointing at the free signup',
    (s) => {
      const e = featureRefusal(st(s), 'sso')
      expect(e.code).toBe('LICENSE_FEATURE_NOT_ENTITLED')
      expect(e.message).toBe(
        "This deployment has no valid license, and 'sso' is not part of community mode. Get a free license at https://opensteward.dev/license",
      )
    },
  )
  it.each(['VALID', 'EXPIRING', 'GRACE'] as const)(
    '%s → the licensed wording: the license does not include it',
    (s) => {
      expect(featureRefusal(st(s), 'sso').message).toBe(
        "This deployment's license does not include 'sso'. See https://opensteward.dev/license",
      )
    },
  )
})

describe('limitRefusal: the one LICENSE_LIMIT_EXCEEDED shape (I20)', () => {
  it('connections: the counts, and how to reconnect at the limit (Review Focus #5)', () => {
    const { error } = limitRefusal('connections', 5, 5).toBody()
    expect(error).toMatchObject({
      code: 'LICENSE_LIMIT_EXCEEDED',
      limitKey: 'connections',
      limit: 5,
      used: 5,
    })
    expect(error.message).toMatch(/export its data, delete it, then reconnect/)
  })
  it("tenants: counts 'default' and keeps existing tenants (A2s-5's text)", () => {
    const { error } = limitRefusal('tenants', 1, 1).toBody()
    expect(error).toMatchObject({
      code: 'LICENSE_LIMIT_EXCEEDED',
      limitKey: 'tenants',
      limit: 1,
      used: 1,
    })
    expect(error.message).toBe(
      "This license allows 1 tenant, counting 'default' (1 registered). Existing tenants keep working. More tenants need a plan that includes them: https://opensteward.dev/license",
    )
  })
  it('connectionReadOnlyRefusal names the connection and promises nothing was deleted (P6)', () => {
    const { error } = connectionReadOnlyRefusal('c-1', 1, 3).toBody()
    expect(error).toMatchObject({
      code: 'LICENSE_LIMIT_EXCEEDED',
      limitKey: 'connections',
      limit: 1,
      used: 3,
      connectionId: 'c-1',
    })
    expect(error.message).toMatch(/read-only.*nothing was deleted/)
  })
  // Review m29: agreement with the count, and no "license" in community mode,
  // where there is none.
  it('connections: "1 exists", "2 exist"', () => {
    expect(limitRefusal('connections', 1, 1).message).toMatch(
      /^This deployment's license allows 1 connection and 1 exists\. /,
    )
    expect(limitRefusal('connections', 2, 2).message).toMatch(
      /^This deployment's license allows 2 connections and 2 exist\. /,
    )
  })
  it('connections in community mode name community mode, never a license', () => {
    const { error } = limitRefusal('connections', 1, 1, 'community').toBody()
    expect(error).toMatchObject({ limitKey: 'connections', limit: 1, used: 1 })
    expect(error.message).toBe(
      'This deployment runs in community mode, which allows 1 connection, and 1 exists. Existing connections keep working and nothing is deleted. To replace one: export its data, delete it, then reconnect. For more connections: https://opensteward.dev/license',
    )
  })
  it('tenants in community mode name community mode; the licensed text is unchanged', () => {
    expect(limitRefusal('tenants', 1, 2, 'community').message).toBe(
      "Community mode allows 1 tenant, counting 'default' (2 registered). Existing tenants keep working. More tenants need a plan that includes them: https://opensteward.dev/license",
    )
    expect(limitRefusal('tenants', 1, 1, 'license').message).toBe(
      limitRefusal('tenants', 1, 1).message,
    )
  })
  it('connectionReadOnlyRefusal pluralizes the count and names who sets the limit', () => {
    expect(connectionReadOnlyRefusal('c-1', 0, 1).message).toMatch(
      /^Connection c-1 is read-only: this deployment has 1 connection and its license allows 0\. /,
    )
    expect(connectionReadOnlyRefusal('c-1', 1, 3).message).toMatch(
      /^Connection c-1 is read-only: this deployment has 3 connections and its license allows 1\. /,
    )
    const { error } = connectionReadOnlyRefusal('c-1', 1, 2, 'community').toBody()
    expect(error).toMatchObject({ limitKey: 'connections', limit: 1, used: 2, connectionId: 'c-1' })
    expect(error.message).toMatch(
      /^Connection c-1 is read-only: this deployment has 2 connections and community mode allows 1\. Reads and syncs still work; nothing was deleted\./,
    )
    expect(error.message).not.toMatch(/license allows/)
  })
})

describe('publicRefusalBody: what an unauthenticated caller sees (review #6)', () => {
  it('the code and a generic message only: no limit, count, feature or license state', () => {
    for (const err of [
      limitRefusal('connections', 1, 3),
      featureRefusal(st('MISSING'), 'vertical:crm'),
    ]) {
      const body = publicRefusalBody(err)
      expect(Object.keys(body.error).sort()).toEqual(['code', 'message'])
      expect(body.error.code).toBe(err.code)
      expect(body.error.message).not.toMatch(/\d|license|vertical:/i)
    }
    expect(publicRefusalBody(limitRefusal('connections', 1, 1)).error.message).toMatch(
      /export.*delete.*reconnect/,
    )
  })
})

describe('LicenseError', () => {
  it('is a deliberate 403 the root error handler turns into the structured envelope', () => {
    expect(new LicenseError('LICENSE_EXPIRED', 'x')).toMatchObject({
      statusCode: 403,
      code: 'LICENSE_EXPIRED',
      name: 'LicenseError',
    })
  })
  it('isLicenseError is a brand check, so a second copy of this module still counts (review #15)', () => {
    expect(isLicenseError(limitRefusal('connections', 1, 1))).toBe(true)
    const foreign = Object.assign(new Error('x'), { code: 'LICENSE_LIMIT_EXCEEDED' })
    Object.defineProperty(foreign, Symbol.for('opensteward.LicenseError'), { value: true })
    expect(isLicenseError(foreign)).toBe(true)
    expect(
      isLicenseError(
        Object.assign(new Error('x'), { code: 'LICENSE_LIMIT_EXCEEDED', statusCode: 403 }),
      ),
    ).toBe(false)
    expect([isLicenseError(null), isLicenseError('LICENSE_EXPIRED')]).toEqual([false, false])
  })
  it('licenseErrorBody writes code and message last, so details cannot override them', () => {
    expect(licenseErrorBody('LICENSE_EXPIRED', 'm', { code: 'X', message: 'Y', extra: 1 })).toEqual(
      {
        error: { extra: 1, code: 'LICENSE_EXPIRED', message: 'm' },
      },
    )
  })
  it('the four codes', () => {
    expect(Object.values(LICENSE_ERROR_CODES).sort()).toEqual([
      'LICENSE_EXPIRED',
      'LICENSE_FEATURE_NOT_ENTITLED',
      'LICENSE_LIMIT_EXCEEDED',
      'LICENSE_STATUS_UNAVAILABLE',
    ])
  })
})
