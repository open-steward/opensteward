/**
 * The real VivaComClient wire shape, against a mocked axios instance:
 *   servers: "https://api.vivapayments.com" (Live) in the Payment API spec
 *   (https://developer.viva.com/downloads/payment-api.yaml),
 *   `Authorization: Bearer <access_token>` from the OAuth2 page
 *   (https://developer.viva.com/integration-reference/oauth2-authentication/),
 *   POST with the filters as a JSON body and PageSize/Page/OrderBy in the query,
 *   and "204 No Content" once past the end.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { VivaComClient } from '../../../../../../src/verticals/payments/adapters/viva-com/client'

const { createMock, postMock } = vi.hoisted(() => ({ createMock: vi.fn(), postMock: vi.fn() }))

vi.mock('axios', () => ({ default: { create: createMock } }))

beforeEach(() => {
  createMock.mockReset()
  postMock.mockReset()
  createMock.mockReturnValue({ post: postMock })
})

describe('VivaComClient', () => {
  it('targets the Live host with a Bearer token', () => {
    new VivaComClient({ accessToken: 'tok_viva' })
    expect(createMock).toHaveBeenCalledTimes(1)
    const config = createMock.mock.calls[0]![0]
    expect(config.baseURL).toBe('https://api.vivapayments.com')
    expect(config.headers.Authorization).toBe('Bearer tok_viva')
  })

  it('POSTs the filters as the JSON body and paging in the query', async () => {
    postMock.mockResolvedValue({ status: 200, data: { data: [{ TransactionId: 'a' }] } })
    const client = new VivaComClient({ accessToken: 'tok_viva' })
    const res = await client.search(
      '/dataservices/v2/transactions/Search',
      { PageSize: 10, Page: 2, OrderBy: 'Ascending' },
      { TransactionTypeIds: [5] },
    )
    expect(postMock).toHaveBeenCalledTimes(1)
    const [path, body, config] = postMock.mock.calls[0]!
    expect(path).toBe('/dataservices/v2/transactions/Search')
    expect(body).toEqual({ TransactionTypeIds: [5] })
    expect(config).toEqual({ params: { PageSize: 10, Page: 2, OrderBy: 'Ascending' } })
    expect(res).toEqual({ status: 200, data: { data: [{ TransactionId: 'a' }] } })
  })

  it('returns no data on a 204 No Content', async () => {
    postMock.mockResolvedValue({ status: 204, data: '' })
    const client = new VivaComClient({ accessToken: 'tok_viva' })
    const res = await client.search('/p', { Page: 9 }, {})
    expect(res).toEqual({ status: 204, data: undefined })
  })
})
