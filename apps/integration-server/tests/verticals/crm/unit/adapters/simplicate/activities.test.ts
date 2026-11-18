import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withPageSink } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { SimplicateAdapter } from '../../../../../../src/verticals/crm/adapters/simplicate/index'

/**
 * Simplicate documents no activity, appointment or agenda endpoint. The
 * first-party OpenAPI (https://developer.simplicate.com/openapi/apiV2.json,
 * 221 paths) has no path containing "appointment", and the adapter's former
 * GET /crm/appointment has no reference page (get-crm-appointment is a 404).
 * Both read methods therefore refuse with 501 before sending anything.
 */

const creds: Credentials = {
  accessToken: 'key',
  extra: { apiSecret: 'secret', subdomain: 'acme' },
}
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('simplicate activities are not documented', () => {
  it('listActivities throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(
      new SimplicateAdapter().listActivities(creds, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('listActivities refuses page 2 the same way', async () => {
    await expect(
      new SimplicateAdapter().listActivities(creds, withPageSink({ page: 2, limit: 3 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('getActivity throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(new SimplicateAdapter().getActivity(creds, 'appointment:1')).rejects.toMatchObject(
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
