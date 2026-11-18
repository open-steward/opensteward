/**
 * Gophr documents no tracking-event history.
 *
 * getTrackingEvents called GET commercial-api/get-status, a path absent from
 * the V2 Commercial API index (https://developers.gophr.com/llms.txt). That
 * index lists Jobs, Deliveries, Parcels, Quotes and a test-only "Progress
 * Delivery Status" endpoint. The only status the reads expose is the current
 * `status` of a delivery (Field-Job-Status in
 * https://developers.gophr.com/reference/get-job.md), with no timestamp, and a
 * current status is not an event history. The method refuses before sending.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { GophrAdapter } from '../../../../../../src/verticals/logistics/adapters/gophr/index'

afterEach(() => vi.restoreAllMocks())

describe('gophr getTrackingEvents', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const get = vi.fn()
    const post = vi.fn()
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
    await expect(
      new GophrAdapter().getTrackingEvents({ accessToken: 'k' }, 'job-1'),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: /Gophr cannot list tracking events/,
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
