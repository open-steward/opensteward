/**
 * Regression pin for a 500 on the setup wizard's credentials step.
 *
 * `POST /setup/wizard/configure` threw `TypeError: scopes.split is not a
 * function` whenever the operator ticked more than one scope. Both the wizard
 * (step 4) and the standalone platform page render the SAME partial,
 * `views/platforms/_credentials-form.ejs`, which posts one repeated `scopes`
 * field per checked box plus a free-text `scopesCustom`. Fastify parses a
 * repeated urlencoded key as `string[]` — and as a bare `string` when exactly
 * one box is ticked.
 *
 * `routes/platforms.ts` handled that correctly. `routes/wizard.ts` did not: it
 * typed `scopes` as `string`, called `.split(',')` on it, and ignored
 * `scopesCustom` entirely. So the wizard worked with exactly one scope selected
 * and 500'd with two or more — and silently dropped any custom scope even when
 * it did not crash.
 *
 * The two handlers diverged because the parsing was duplicated. These tests
 * cover the extracted helper both now use, so they cannot drift apart again.
 */
import { describe, it, expect } from 'vitest'
import { buildPlatformConfig } from '../../../src/core/routes/platform-config-body.js'

describe('buildPlatformConfig — scope parsing', () => {
  it('accepts the array Fastify produces for multiple ticked boxes', () => {
    // The exact shape the wizard posted when this 500'd.
    const config = buildPlatformConfig({
      clientId: 'LMTc1IGwN7Hz',
      clientSecret: 'redacted',
      redirectUri: 'http://localhost:3010/auth/accounting/fortnox/callback',
      scopes: [
        'companyinformation',
        'invoice.read',
        'customer.read',
        'supplier.read',
        'supplierinvoice.read',
        'order.read',
        'payment.read',
        'settings.read',
      ],
      scopesCustom: '',
    })
    expect(config.scopes).toEqual([
      'companyinformation',
      'invoice.read',
      'customer.read',
      'supplier.read',
      'supplierinvoice.read',
      'order.read',
      'payment.read',
      'settings.read',
    ])
  })

  it('accepts the bare string Fastify produces for a single ticked box', () => {
    const config = buildPlatformConfig({ scopes: 'companyinformation' })
    expect(config.scopes).toEqual(['companyinformation'])
  })

  it('merges free-text custom scopes, comma- or whitespace-separated', () => {
    const config = buildPlatformConfig({
      scopes: ['invoice.read'],
      scopesCustom: 'bookkeeping, archive  profile',
    })
    expect(config.scopes).toEqual(['invoice.read', 'bookkeeping', 'archive', 'profile'])
  })

  it('de-duplicates across checkboxes and free text', () => {
    const config = buildPlatformConfig({
      scopes: ['invoice.read', 'customer.read'],
      scopesCustom: 'invoice.read',
    })
    expect(config.scopes).toEqual(['invoice.read', 'customer.read'])
  })

  it('omits scopes entirely when the operator never touched the picker', () => {
    // Distinct from "picked none" — omitting leaves the stored value intact.
    expect(buildPlatformConfig({ clientId: 'abc' })).not.toHaveProperty('scopes')
  })

  it('records an empty selection when the picker was touched but cleared', () => {
    expect(buildPlatformConfig({ scopesCustom: '' }).scopes).toEqual([])
  })
})

describe('buildPlatformConfig — credential fields', () => {
  it('omits clientSecret when blank so a stored secret is not wiped', () => {
    // setPlatformConfig merges server-side; sending '' would overwrite.
    expect(buildPlatformConfig({ clientId: 'abc', clientSecret: '' })).not.toHaveProperty(
      'clientSecret',
    )
  })

  it('includes clientSecret when the operator actually typed one', () => {
    expect(buildPlatformConfig({ clientSecret: 's3cret' }).clientSecret).toBe('s3cret')
  })

  it('trims clientId and redirectUri', () => {
    const config = buildPlatformConfig({
      clientId: '  abc  ',
      redirectUri: '  http://localhost:3010/cb  ',
    })
    expect(config.clientId).toBe('abc')
    expect(config.redirectUri).toBe('http://localhost:3010/cb')
  })
})

describe('the sandbox toggle', () => {
  /**
   * ShipBob runs two independent OAuth environments and an app exists in one.
   * Picking the wrong one is refused by the provider's own error page, which
   * names no cause — so the flag has to be settable, and just as importantly
   * CLEARABLE, from the UI.
   */

  it('sets sandbox true when ticked', () => {
    expect(buildPlatformConfig({ sandboxPresent: '1', sandbox: 'true' }).sandbox).toBe(true)
  })

  it('sets sandbox FALSE when the control rendered but was not ticked', () => {
    // The assertion that matters. An unticked checkbox posts nothing, and the
    // backend merges config — so keying off `sandbox` alone would leave a
    // previously-true flag set forever, and un-ticking would appear to do
    // nothing. `sandboxPresent` is what makes the absence meaningful.
    expect(buildPlatformConfig({ sandboxPresent: '1' }).sandbox).toBe(false)
  })

  it('does not touch sandbox at all when the form had no such control', () => {
    // Platforms without a sandbox environment must never acquire the key —
    // the merge would otherwise write `sandbox: false` onto all 1,546 of them.
    expect('sandbox' in buildPlatformConfig({ clientId: 'x' })).toBe(false)
  })

  it('leaves the other fields alone', () => {
    const c = buildPlatformConfig({ sandboxPresent: '1', sandbox: 'true', clientId: ' id ' })
    expect(c.clientId).toBe('id')
    expect(c.sandbox).toBe(true)
    // Blank secret still means "unchanged", not "wipe it".
    expect('clientSecret' in c).toBe(false)
  })
})
