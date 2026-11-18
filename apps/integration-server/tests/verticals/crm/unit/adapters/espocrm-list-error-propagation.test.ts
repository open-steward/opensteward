/**
 * listPipelines is a CRM LISTABLE_RESOURCES method, so the sync worker calls it and
 * treats the returned array as truth — a `catch { return [] }` makes a dead
 * upstream indistinguishable from "this account has no pipelines", and the worker
 * records a green "synced 0" for it.
 *
 * The old 404 → [] carve-out existed for a non-existent OpportunityStage entity
 * type, so it hid a failure on every instance. listPipelines now reads the
 * Pipeline entity (v10.0+), and a 404 propagates like any other error.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'
import { EspoCrmAdapter } from '../../../../../src/verticals/crm/adapters/espocrm'

const creds = {
  accessToken: 'tok',
  extra: { instanceUrl: 'https://espo.example.com' },
} as Credentials

function respond(status: number): void {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('error', { status }))
}

afterEach(() => vi.restoreAllMocks())

describe('EspoCRM listPipelines', () => {
  for (const status of [500, 401, 404]) {
    it(`propagates a ${status} rather than reporting "no pipelines"`, async () => {
      respond(status)
      await expect(new EspoCrmAdapter().listPipelines(creds, {})).rejects.toMatchObject({
        statusCode: status,
      })
    })
  }
})
