/**
 * Octopus credit memos are refused before any request.
 *
 * The adapter used to call `GET salesInvoices?creditNote=true` and
 * `GET salesInvoices/{id}`. Octopus's published spec
 * (https://service.inaras.be/octopus-rest-api/v1/openapi.json) has no
 * salesInvoices path. It documents credit notes as negative-total invoices,
 * but only under /dossiers/{dossierId}/… with a dossierToken header, which
 * this adapter cannot call (see the adapter README).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { withPageSink } from '@opensteward/shared'
import { OctopusAdapter } from '../../../../../../src/verticals/accounting/adapters/octopus'
import { metadata } from '../../../../../../src/verticals/accounting/adapters/octopus/metadata'

const CREDS = { accessToken: 'dossier-token' }

function spyHttp(): { calls: string[] } {
  const calls: string[] = []
  const record = async (path: string) => {
    calls.push(path)
    return { data: [] }
  }
  vi.spyOn(axios, 'create').mockReturnValue({
    get: record,
    post: record,
    put: record,
    delete: record,
  } as never)
  return { calls }
}

afterEach(() => vi.restoreAllMocks())

describe('OctopusAdapter credit memos', () => {
  it('listCreditMemos answers 501 NOT_SUPPORTED without a request', async () => {
    const { calls } = spyHttp()
    await expect(
      new OctopusAdapter().listCreditMemos(CREDS, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toEqual([])
  })

  it('getCreditMemo answers 501 NOT_SUPPORTED without a request', async () => {
    const { calls } = spyHttp()
    await expect(new OctopusAdapter().getCreditMemo(CREDS, '42')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })

  it('declares creditmemo unavailable in metadata.ts', () => {
    expect(metadata.availableResources as readonly string[]).not.toContain('creditmemo')
    expect(metadata.unavailableResources.map((r) => r.resource)).toContain('creditmemo')
  })
})
