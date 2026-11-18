/**
 * Oneflow audit trail: refused before any request.
 *
 * The adapter used to call `GET /contracts/{id}/audit_trail`, which is not in
 * Oneflow's API reference (https://developer.oneflow.com/llms.txt) and which
 * the live API answers with 404 "The requested URL was not found on the
 * server". It swallowed that error and returned `[]`, so every contract
 * looked like it had an empty history.
 *
 * The reference documents contract events only by id — "Get a contract event
 * by ID" at `/contracts/{contract_id}/events/{event_id}`
 * (https://developer.oneflow.com/reference/get-a-contract-event-by-id.md) —
 * and documents no operation that lists them, so both methods refuse with
 * 501 NOT_SUPPORTED and send nothing.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { OneflowClient } from '../../../../../../src/verticals/docsign/adapters/oneflow/client'
import { OneflowAdapter } from '../../../../../../src/verticals/docsign/adapters/oneflow'

const CREDS = { accessToken: 'tok', refreshToken: 'rt' } as Credentials
const adapter = new OneflowAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'r' })

afterEach(() => vi.restoreAllMocks())

function spyTransport() {
  const get = vi.spyOn(OneflowClient.prototype, 'get').mockResolvedValue({ data: [] } as never)
  const post = vi.spyOn(OneflowClient.prototype, 'post').mockResolvedValue({} as never)
  return { get, post }
}

describe('OneflowAdapter audit trail is refused before any request', () => {
  it('listAuditTrailEntries throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get, post } = spyTransport()
    await expect(
      adapter.listAuditTrailEntries(CREDS, '10001', { page: 1, limit: 2 }),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    await expect(adapter.listAuditTrailEntries(CREDS, '10001', {})).rejects.toThrow(
      /Oneflow cannot list audit trail entries/,
    )
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('getAuditTrailEntry throws 501 NOT_SUPPORTED and sends no request', async () => {
    const { get, post } = spyTransport()
    await expect(adapter.getAuditTrailEntry(CREDS, '10001:160001')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })

  it('getAuditTrailEntry names why the documented by-id read is not used', async () => {
    const { get, post } = spyTransport()
    const err = await adapter.getAuditTrailEntry(CREDS, '10001:160001').catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    const message = (err as Error).message
    expect(message).toMatch(/^Oneflow cannot get audit trail entries: /)
    // Oneflow does document a by-id read, so the error must not say otherwise.
    expect(message).not.toMatch(/no operation that lists/)
    expect(message).toContain('/contracts/{contract_id}/events/{event_id}')
    expect(message).toContain('x-oneflow-api-token')
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})
