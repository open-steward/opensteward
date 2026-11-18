/**
 * voidEnvelope used to POST /documents/{id}/cancel with a JSON {reason} body
 * and then re-GET the envelope — CloudSign has no /cancel route. The
 * fix is PUT /documents/{id}/decline with form-urlencoded `comment`, reading
 * the returned documentModel directly.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { CloudSignAdapter } from '../../../../../../src/verticals/docsign/adapters/cloudsign'
import { CloudSignClient } from '../../../../../../src/verticals/docsign/adapters/cloudsign/client'

const creds = { accessToken: 'tok' } as Credentials
const cfg = {
  clientId: 'id',
  clientSecret: 'secret',
  redirectUri: 'https://example.com/cb',
}

afterEach(() => vi.restoreAllMocks())

describe('CloudSignAdapter.voidEnvelope', () => {
  it('PUTs /documents/{id}/decline with the reason as form field `comment`', async () => {
    const putSpy = vi.spyOn(CloudSignClient.prototype, 'put').mockResolvedValue({
      id: 'doc_1',
      title: 'NDA',
      status: 5,
      participants: [],
      created_at: '2025-01-01T00:00:00Z',
    } as never)
    const getSpy = vi.spyOn(CloudSignClient.prototype, 'get')

    const adapter = new CloudSignAdapter(cfg)
    const out = await adapter.voidEnvelope(creds, 'doc_1', { reason: 'sent to the wrong party' })

    expect(putSpy).toHaveBeenCalledTimes(1)
    expect(putSpy.mock.calls[0]![0]).toBe('/documents/doc_1/decline')
    expect(putSpy.mock.calls[0]![1]).toEqual({ comment: 'sent to the wrong party' })

    // The PUT response is already the updated documentModel — no follow-up GET.
    expect(getSpy).not.toHaveBeenCalled()
    expect(out.id).toBe('doc_1')
    expect(out.platform).toBe('cloudsign')
  })

  it('defaults the comment when no reason is given', async () => {
    const putSpy = vi.spyOn(CloudSignClient.prototype, 'put').mockResolvedValue({
      id: 'doc_2',
      status: 5,
      participants: [],
    } as never)

    const adapter = new CloudSignAdapter(cfg)
    await adapter.voidEnvelope(creds, 'doc_2')

    expect(putSpy.mock.calls[0]![1]).toEqual({ comment: 'Voided by API' })
  })
})
