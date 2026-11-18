import { describe, expect, it, vi } from 'vitest'

describe('@opensteward/shared/licensing barrel', () => {
  it('exports the public API and never the key ring, the key maps or the dev keys', async () => {
    const licensing = (await import('../../src/licensing')) as Record<string, unknown>
    for (const name of [
      'LicenseError',
      'isLicenseError',
      'featureRefusal',
      'limitRefusal',
      'connectionReadOnlyRefusal',
      'publicRefusalBody',
      'LICENSE_ERROR_CODES',
      'licenseErrorBody',
      'LICENSE_RENEWAL_URL',
      'LICENSE_SIGNUP_URL',
      'GRACE_PERIOD_MS',
      'COMMUNITY_ENTITLEMENTS',
      'readLicenseSource',
      'evaluateLicense',
      'EntitlementService',
      'formatLicenseLogLine',
      'LicenseStatusDTOSchema',
      'toLicenseStatusDTO',
      'inspectLicense',
      'isDevKid',
      'devKeysPresent',
      'PRODUCTION_KIDS',
      'LICENSE_INVALID_REASONS',
      'LICENSE_STATES',
      'LicenseManager',
      'LicenseStateStore',
      'LICENSE_TICK_INTERVAL_MS',
      'LICENSE_STATE_NAMESPACE',
    ]) {
      expect(licensing, name).toHaveProperty(name)
    }
    for (const name of ['getKeyring', 'PRODUCTION_KEYS', 'DEV_KEYS', 'loadDevKeys']) {
      expect(Object.keys(licensing), name).not.toContain(name)
    }
  })
  it('has no import-time side effects: importing starts no interval', async () => {
    // A2c-4 adds LicenseManager to the barrel; its tick starts in start(), never at import.
    const interval = vi.spyOn(globalThis, 'setInterval')
    try {
      vi.resetModules()
      await import('../../src/licensing')
      expect(interval).not.toHaveBeenCalled()
    } finally {
      interval.mockRestore()
    }
  })
})
