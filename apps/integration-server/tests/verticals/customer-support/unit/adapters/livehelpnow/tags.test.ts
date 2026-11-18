/**
 * LiveHelpNow tags.
 *
 * The API reference (https://developer.livehelpnow.net/docs/api/endpoint/ticket/tickets
 * and its sidebar of every endpoint) documents no tag list. The only tag
 * endpoint is https://developer.livehelpnow.net/docs/api/endpoint/ticket/tag:
 *
 *   "POST /api/ticket/{id}/tag Tag a ticket ... tag_id required The tag id to
 *    associate to the ticket"
 *
 * Tickets carry tag names on the list (ticket/tickets: "tags ... The tag
 * names") and tag ids on the details (ticket/details with include_tags:
 * "tags ... The tag id"), but no endpoint pairs a name with its id, and
 * TagSchema needs both. listTags must refuse before sending anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { withPageSink, type Credentials } from '@opensteward/shared'
import { LivehelpnowAdapter } from '../../../../../../src/verticals/customer-support/adapters/livehelpnow/index'

const creds: Credentials = { accessToken: 'tok' }
let sent: string[] = []

beforeEach(() => {
  sent = []
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: async (path: string) => {
          sent.push(`GET ${path}`)
          return {
            data: {
              payload: { tickets: [{ id: 1, tags: ['billing'] }], total_rows: 1 },
              status: 'ok',
            },
          }
        },
        post: async (path: string) => {
          sent.push(`POST ${path}`)
          return { data: {} }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
  vi.spyOn(axios, 'post').mockImplementation(async (url: string) => {
    sent.push(`POST ${url}`)
    return { data: {} }
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('LivehelpnowAdapter.listTags', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const adapter = new LivehelpnowAdapter()
    await expect(
      adapter.listTags(creds, withPageSink({ page: 1, limit: 3 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^LiveHelpNow cannot list tags: /),
    })
    expect(sent).toEqual([])
  })
})
