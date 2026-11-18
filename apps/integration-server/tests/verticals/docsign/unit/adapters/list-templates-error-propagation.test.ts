/**
 * listTemplates must not turn an upstream failure into an empty list.
 *
 * `listTemplates` is a LISTABLE_RESOURCES method (docsign/sync/listable-resources.ts),
 * so the sync worker calls it directly. The worker treats a returned array as truth:
 * it records a circuit-breaker SUCCESS and reports "synced 0 templates". A blanket
 * `catch { return [] }` therefore converts "the platform is down / the key was
 * revoked" into "this account has no templates" — the operator sees a green sync job
 * that copied nothing, with nothing logged anywhere saying why.
 *
 * A 404 is a real answer: several of these platforms simply do not expose /templates.
 * Everything else must propagate.
 *
 * Signhost, Dokobit, InfoCert and DigiSigner are left out: none of their APIs has a
 * templates endpoint, so their listTemplates throws NOT_SUPPORTED without a request.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'

import { OneflowAdapter } from '../../../../../src/verticals/docsign/adapters/oneflow'
import { OneflowClient } from '../../../../../src/verticals/docsign/adapters/oneflow/client'
import { LexPersonaAdapter } from '../../../../../src/verticals/docsign/adapters/lex-persona'
import { LexPersonaClient } from '../../../../../src/verticals/docsign/adapters/lex-persona/client'
import { ScriveAdapter } from '../../../../../src/verticals/docsign/adapters/scrive'
import { ScriveClient } from '../../../../../src/verticals/docsign/adapters/scrive/client'
import { PenneoAdapter } from '../../../../../src/verticals/docsign/adapters/penneo'
import { PenneoClient } from '../../../../../src/verticals/docsign/adapters/penneo/client'

const creds = { accessToken: 'tok' } as Credentials
const cfg = { clientId: 'id', clientSecret: 'secret', redirectUri: 'https://x' }

function httpError(status: number): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: {} },
    statusCode: status,
  })
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const cases: Array<{ name: string; Adapter: any; Client: any }> = [
  { name: 'oneflow', Adapter: OneflowAdapter, Client: OneflowClient },
  { name: 'lex-persona', Adapter: LexPersonaAdapter, Client: LexPersonaClient },
  { name: 'scrive', Adapter: ScriveAdapter, Client: ScriveClient },
  { name: 'penneo', Adapter: PenneoAdapter, Client: PenneoClient },
]
/* eslint-enable @typescript-eslint/no-explicit-any */

afterEach(() => vi.restoreAllMocks())

describe('docsign listTemplates surfaces upstream failure', () => {
  for (const { name, Adapter, Client } of cases) {
    it(`${name}: a 500 propagates instead of reading as "no templates"`, async () => {
      vi.spyOn(Client.prototype, 'get').mockRejectedValue(httpError(500))
      const adapter = new Adapter(cfg)
      await expect(adapter.listTemplates(creds, {})).rejects.toThrow()
    })

    it(`${name}: a 401 propagates instead of reading as "no templates"`, async () => {
      vi.spyOn(Client.prototype, 'get').mockRejectedValue(httpError(401))
      const adapter = new Adapter(cfg)
      await expect(adapter.listTemplates(creds, {})).rejects.toThrow()
    })

    it(`${name}: a 404 still means "this platform has no templates"`, async () => {
      vi.spyOn(Client.prototype, 'get').mockRejectedValue(httpError(404))
      const adapter = new Adapter(cfg)
      await expect(adapter.listTemplates(creds, {})).resolves.toEqual([])
    })
  }
})
