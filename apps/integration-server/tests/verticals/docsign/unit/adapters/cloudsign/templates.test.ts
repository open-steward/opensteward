/**
 * listTemplates/getTemplate used to call the undocumented /templates and
 * /templates/{id}. CloudSign has no such route — a "template" is a
 * documentModel with status=4, read off the same GET /documents (paged,
 * status filter) and GET /documents/{id} envelopes use.
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

describe('CloudSignAdapter.listTemplates', () => {
  it('GETs /documents with status=4 and reads documents[], not templates[]', async () => {
    const getSpy = vi.spyOn(CloudSignClient.prototype, 'get').mockResolvedValue({
      documents: [{ id: 'doc_1', title: 'NDA', status: 4, participants: [], files: [] }],
      templates: [{ id: 'should-not-be-read' }],
    } as never)

    const adapter = new CloudSignAdapter(cfg)
    const out = await adapter.listTemplates(creds, {})

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy.mock.calls[0]![0]).toBe('/documents')
    expect(getSpy.mock.calls[0]![1]).toMatchObject({ status: 4 })
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('doc_1')
  })

  it('walks upstream pages from page=1 with status=4, not the caller page number', async () => {
    // Caller page 3 is a row window, not upstream page 3: a cold walk starts
    // at upstream page 1 and an empty page ends it. Paging is covered in
    // paging.test.ts.
    const getSpy = vi.spyOn(CloudSignClient.prototype, 'get').mockResolvedValue({
      documents: [],
    } as never)

    const adapter = new CloudSignAdapter(cfg)
    await adapter.listTemplates({ accessToken: 'tok-page3' } as Credentials, {
      page: 3,
      limit: 100,
    })

    expect(getSpy).toHaveBeenCalledTimes(1)
    expect(getSpy.mock.calls[0]![1]).toEqual({ status: 4, page: 1 })
  })

  it('propagates an upstream failure instead of reading it as "no templates"', async () => {
    const err = Object.assign(new Error('boom'), {
      isAxiosError: true,
      response: { status: 500, data: {} },
    })
    vi.spyOn(CloudSignClient.prototype, 'get').mockRejectedValue(err)

    const adapter = new CloudSignAdapter(cfg)
    await expect(adapter.listTemplates(creds, {})).rejects.toThrow()
  })
})

describe('CloudSignAdapter.getTemplate', () => {
  it('GETs /documents/{id} and returns it when status=4', async () => {
    const getSpy = vi.spyOn(CloudSignClient.prototype, 'get').mockResolvedValue({
      id: 'doc_1',
      title: 'NDA Template',
      status: 4,
      participants: [],
      files: [],
    } as never)

    const adapter = new CloudSignAdapter(cfg)
    const out = await adapter.getTemplate(creds, 'doc_1')

    expect(getSpy.mock.calls[0]![0]).toBe('/documents/doc_1')
    expect(out.id).toBe('doc_1')
    expect(out.name).toBe('NDA Template')
  })

  it('rejects with a 404 when the document is not status=4', async () => {
    vi.spyOn(CloudSignClient.prototype, 'get').mockResolvedValue({
      id: 'doc_2',
      title: 'A live envelope',
      status: 1,
    } as never)

    const adapter = new CloudSignAdapter(cfg)
    await expect(adapter.getTemplate(creds, 'doc_2')).rejects.toMatchObject({ statusCode: 404 })
  })
})
