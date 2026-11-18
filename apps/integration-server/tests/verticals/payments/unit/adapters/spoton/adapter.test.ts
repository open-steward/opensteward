/**
 * SpotOnAdapter read methods.
 *
 * SpotOn's public API is the Centralized API, where "every call" has the shape
 * `GET https://api.spoton.com/{service_name}/{api_version}/{endpoint}`
 * (https://developers.spoton.com/central-api/docs/spoton-oauth-integration-guide).
 * The 40 reference pages listed in https://developers.spoton.com/central-api/llms.txt
 * define 36 paths under /business, /labor, /loyalty, /menu, /onboarding,
 * /order, /reporting and /reservation. None is a charge or payout resource,
 * so the charge and payout reads refuse with 501 before sending anything.
 */
import { describe, it, expect, vi } from 'vitest'
import type { Credentials } from '@opensteward/shared'

const { getMock, postMock, createMock } = vi.hoisted(() => {
  const getMock = vi.fn()
  const postMock = vi.fn()
  const createMock = vi.fn((_cfg?: unknown) => ({ get: getMock, post: postMock }))
  return { getMock, postMock, createMock }
})

vi.mock('axios', () => ({
  default: { create: createMock, get: getMock, post: postMock },
}))

import { SpotOnAdapter } from '../../../../../../src/verticals/payments/adapters/spoton'

const adapter = new SpotOnAdapter({
  clientId: 'cid',
  clientSecret: 'secret',
  redirectUri: 'https://x/cb',
})
const CREDS: Credentials = { accessToken: 'tok' }

describe.each([
  ['listCharges', /^SpotOn cannot list charges: .*requires a location_id/],
  ['getCharge', /^SpotOn cannot read charges: /],
  ['listPayouts', /^SpotOn cannot list payouts: /],
  ['getPayout', /^SpotOn cannot read payouts: /],
] as const)('SpotOnAdapter.%s', (method, message) => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const fn = adapter[method].bind(adapter) as (c: Credentials, a: unknown) => Promise<unknown>
    const arg = method.startsWith('list') ? { page: 1, limit: 10 } : 'some-id'
    await expect(fn(CREDS, arg)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(message),
    })
    expect(createMock).not.toHaveBeenCalled()
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })
})
