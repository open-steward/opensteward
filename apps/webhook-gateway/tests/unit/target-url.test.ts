/**
 * Pins the shape of the URL the gateway forwards inbound webhooks to.
 *
 * integration-server's route is `/webhooks/:vertical/:platform`
 * (packages/shared/src/control-plane/webhooks-router.ts), so the forwarded
 * URL must carry both params — omitting the vertical 404s every forward at
 * the destination.
 *
 * `tests/unit/routes.test.ts` re-implements the handler inline rather than
 * importing it, so an assertion there could only validate a copy, not the
 * code that ships. Hence a tiny pure function the production path actually
 * calls, tested directly.
 */
import { describe, it, expect } from 'vitest'
import { buildTargetUrl } from '../../src/core/target-url'

describe('buildTargetUrl', () => {
  it('includes the vertical segment integration-server routes on', () => {
    expect(buildTargetUrl('http://integration-server:3010', 'logistics', 'fedex')).toBe(
      'http://integration-server:3010/webhooks/logistics/fedex',
    )
  })

  it('produces exactly the two path params /webhooks/:vertical/:platform declares', () => {
    const url = new URL(buildTargetUrl('http://integration-server:3010', 'accounting', 'xero'))
    // ['', 'webhooks', vertical, platform]
    expect(url.pathname.split('/')).toEqual(['', 'webhooks', 'accounting', 'xero'])
  })

  it('does not emit a doubled slash when the base URL has a trailing one', () => {
    // INTEGRATION_SERVER_URL is operator-supplied, so a trailing slash is a
    // realistic input; `//webhooks/...` would not match the route.
    expect(buildTargetUrl('http://integration-server:3010/', 'payments', 'stripe')).toBe(
      'http://integration-server:3010/webhooks/payments/stripe',
    )
  })

  it('is stable for every platform declared in the shipped config', () => {
    const shipped = [
      { platform: 'xero', vertical: 'accounting' },
      { platform: 'quickbooks', vertical: 'accounting' },
      { platform: 'fedex', vertical: 'logistics' },
      { platform: 'ups', vertical: 'logistics' },
    ]
    for (const { platform, vertical } of shipped) {
      expect(buildTargetUrl('http://h:3010', vertical, platform)).toBe(
        `http://h:3010/webhooks/${vertical}/${platform}`,
      )
    }
  })
})
