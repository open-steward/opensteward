/**
 * `UnsupportedPlatform` is the contract every other unsupported-status task
 * (admin API, admin UI, platforms-ui) builds on: a platform can be listed and
 * viewable while remaining uninstallable. This file pins the two pure helpers
 * that make the status usable across the control-plane routers —
 * `unsupportedIndex` (build a `${vertical}:${slug}` lookup from a flat
 * platform list) and `unsupportedRefusal` (the exact HTTP 400 body every
 * refusal choke point sends) — so a change to either shape breaks loudly
 * here rather than silently in a consumer.
 */
import { describe, it, expect } from 'vitest'
import {
  unsupportedIndex,
  unsupportedRefusal,
  type UnsupportedPlatform,
} from '../../src/reference/platform-status'

describe('unsupportedIndex', () => {
  it('keys entries by `${vertical}:${slug}`, omitting platforms without `unsupported`', () => {
    const platforms = [
      { vertical: 'ecommerce', slug: 'weebly', unsupported: { reason: 'API retired' } },
      { vertical: 'ecommerce', slug: 'shopify' },
      {
        vertical: 'crm',
        slug: 'weebly',
        unsupported: {
          reason: 'Same slug, different vertical — must not collide with ecommerce:weebly',
          issueUrl: 'https://github.com/open-steward/opensteward/issues/1',
        },
      },
    ]
    const idx = unsupportedIndex(platforms)
    expect(idx.size).toBe(2)
    expect(idx.get('ecommerce:weebly')).toEqual({ reason: 'API retired' })
    expect(idx.get('crm:weebly')).toEqual({
      reason: 'Same slug, different vertical — must not collide with ecommerce:weebly',
      issueUrl: 'https://github.com/open-steward/opensteward/issues/1',
    })
    expect(idx.has('ecommerce:shopify')).toBe(false)
  })

  it('returns an empty map for an empty or all-supported list', () => {
    expect(unsupportedIndex([]).size).toBe(0)
    expect(unsupportedIndex([{ vertical: 'crm', slug: 'x' }]).size).toBe(0)
  })
})

describe('unsupportedRefusal', () => {
  it('builds the refusal body with no `issueUrl` key at all when none is given', () => {
    const body = unsupportedRefusal('Weebly', { reason: 'API retired, no successor' })
    expect(body).toEqual({
      error: {
        code: 'PLATFORM_UNSUPPORTED',
        message: 'Weebly is not supported: API retired, no successor',
        reason: 'API retired, no successor',
      },
    })
    expect(Object.prototype.hasOwnProperty.call(body.error, 'issueUrl')).toBe(false)
  })

  it('includes `issueUrl` when present', () => {
    const info: UnsupportedPlatform = {
      reason: 'Per-instance OAuth client cannot be authorized by our deployment-wide app',
      issueUrl: 'https://github.com/open-steward/opensteward/issues/1',
    }
    const body = unsupportedRefusal('Acme Corp', info)
    expect(body).toEqual({
      error: {
        code: 'PLATFORM_UNSUPPORTED',
        message:
          'Acme Corp is not supported: Per-instance OAuth client cannot be authorized by our deployment-wide app',
        reason: 'Per-instance OAuth client cannot be authorized by our deployment-wide app',
        issueUrl: 'https://github.com/open-steward/opensteward/issues/1',
      },
    })
  })
})
