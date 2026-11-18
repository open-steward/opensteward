/**
 * Webdox CLM signer and document reads: request shape and paging.
 *
 * Every fake answers at the axios layer and honours ONLY the documented
 * requests (https://doc.webdoxclm.com/docs/v2/en/index.html):
 *   - "Workflow Info": `GET https://api.webdoxclm.com/api/v2/decision_workflows/:id`,
 *     whose response carries the workflow's `documents`;
 *   - "List steps": `GET .../decision_workflows/<ID>/steps`, a bare array;
 *   - "Get all signers from a decision workflow step":
 *     `GET .../decision_workflows/<WF_ID>/steps/<STEP_NUMBER>/signers?parallel_number=<PARALLEL_STEP_NUMBER>`,
 *     a bare array.
 * None of the three documents a page parameter, so the adapter reads the
 * whole set and pages it locally. Anything else throws.
 */
import axios, { type AxiosRequestConfig } from 'axios'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { WebdoxAdapter } from '../../../../../../src/verticals/docsign/adapters/webdox'
import { SignerSchema } from '../../../../../../src/verticals/docsign/schema/signer'
import { DocumentSchema } from '../../../../../../src/verticals/docsign/schema/document'
import { signerExample, stepsExample, workflowInfoExample } from './fixtures'

const CREDS: Credentials = { accessToken: 'token-1' }
const WF = '78'
const L = 2
const N = 2 * L + 1
const CALL_BUDGET = 50

const adapter = new WebdoxAdapter()

afterEach(() => vi.restoreAllMocks())

interface Sent {
  method: string
  url: string
  params: unknown
  headers: Record<string, unknown>
  baseURL: string | undefined
}

function fakeAxios(handler: (url: string, params: unknown) => unknown) {
  const sent: Sent[] = []
  let calls = 0
  vi.spyOn(axios.Axios.prototype, 'request').mockImplementation(async function (
    this: { defaults: AxiosRequestConfig },
    config,
  ) {
    if (++calls > CALL_BUDGET) throw new Error('call budget exceeded: the adapter kept paging')
    const cfg = config as AxiosRequestConfig
    const url = String(cfg.url)
    sent.push({
      method: String(cfg.method ?? 'get').toLowerCase(),
      url,
      params: cfg.params,
      headers: { ...(this.defaults.headers as unknown as Record<string, unknown>) },
      baseURL: this.defaults.baseURL,
    })
    return { data: handler(url, cfg.params), status: 200, headers: {}, config: cfg } as never
  })
  return sent
}

function noParams(params: unknown): void {
  if (params !== undefined && Object.keys(params as object).length > 0) {
    throw new Error(`undocumented parameters ${JSON.stringify(params)}`)
  }
}

/**
 * A workflow with two signature steps — step 1 on parallel lane 0 and step 3
 * on parallel lane 1 — around a non-signature step 2. Signers are split
 * across the two signature steps so the walk crosses a step boundary.
 *
 * Step 3 is trimmed to the documented `step_type` alone (no
 * `is_signature_step`), which pins that the adapter selects signature steps
 * by `step_type === 'signature'`, the field its docs comment names.
 */
function fakeWorkflow(n: number) {
  const [sig, other] = stepsExample()
  const { is_signature_step: _unused, ...sigByTypeOnly } = sig!
  const steps = [
    sig,
    other,
    { ...sigByTypeOnly, id_number: 3, id_parallel: 1, name: 'Second signature' },
  ]
  const signers = Array.from({ length: n }, (_, i) => ({
    ...signerExample(),
    id: `signer-${i + 1}`,
    email: `signer${i + 1}@example.com`,
  }))
  const byStep: Record<string, typeof signers> = {
    '1:0': signers.slice(0, 2),
    '3:1': signers.slice(2),
  }
  const documents = Array.from({ length: n }, (_, i) => ({
    ...workflowInfoExample().documents[0]!,
    id: `doc-${i + 1}`,
    name: `doc-${i + 1}.pdf`,
  }))
  const info = { ...workflowInfoExample(), id: Number(WF), documents }

  return fakeAxios((url, params) => {
    if (url === `/decision_workflows/${WF}`) {
      noParams(params)
      return info
    }
    if (url === `/decision_workflows/${WF}/steps`) {
      noParams(params)
      return steps
    }
    const m = /^\/decision_workflows\/78\/steps\/(\d+)\/signers$/.exec(url)
    if (m) {
      const p = params as Record<string, unknown> | undefined
      const keys = Object.keys(p ?? {})
      if (keys.length !== 1 || keys[0] !== 'parallel_number') {
        throw new Error(`signers takes only parallel_number, got ${JSON.stringify(p)}`)
      }
      const rows = byStep[`${m[1]}:${String(p!['parallel_number'])}`]
      if (!rows) throw new Error(`no such step ${m[1]} / parallel ${String(p!['parallel_number'])}`)
      return rows
    }
    throw new Error(`undocumented path ${url}`)
  })
}

async function walk(list: (params: QueryParams) => Promise<Array<{ id: string }>>) {
  const seen: string[] = []
  const more: Array<boolean | undefined> = []
  for (let page = 1; page <= 3; page++) {
    const params = withPageSink({ page, limit: L })
    seen.push(...(await list(params)).map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { seen, more }
}

describe('WebdoxAdapter.listSigners', () => {
  it('reads the steps array, then each signature step with its parallel_number', async () => {
    const sent = fakeWorkflow(N)
    const rows = await adapter.listSigners(CREDS, WF, {})
    expect(sent.map((s) => [s.method, s.url, s.params])).toEqual([
      ['get', `/decision_workflows/${WF}/steps`, undefined],
      ['get', `/decision_workflows/${WF}/steps/1/signers`, { parallel_number: 0 }],
      ['get', `/decision_workflows/${WF}/steps/3/signers`, { parallel_number: 1 }],
    ])
    expect(sent[0]!.baseURL).toBe('https://api.webdoxclm.com/api/v2')
    expect(sent[0]!.headers['Authorization']).toBe('Bearer token-1')
    expect(rows).toHaveLength(N)
    for (const r of rows) SignerSchema.parse(r)
    expect(rows[0]!.envelopeId).toBe(WF)
  })

  it(`walks N = ${N} signers at limit ${L}: every id once, hasMore exact`, async () => {
    fakeWorkflow(N)
    const { seen, more } = await walk((p) => adapter.listSigners(CREDS, WF, p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `signer-${i + 1}`))
    expect(more).toEqual([true, true, false])
  })

  it('getSigner reads back an id the list returned', async () => {
    fakeWorkflow(N)
    const signer = await adapter.getSigner(CREDS, `${WF}:signer-4`)
    expect(signer.id).toBe('signer-4')
    expect(signer.metadata['stepParallelNumber']).toBe('0')
  })
})

describe('WebdoxAdapter.listDocuments', () => {
  it('reads documents from Workflow Info, not the download-links endpoint', async () => {
    const sent = fakeWorkflow(N)
    const rows = await adapter.listDocuments(CREDS, WF, {})
    expect(sent.map((s) => [s.method, s.url, s.params])).toEqual([
      ['get', `/decision_workflows/${WF}`, undefined],
    ])
    expect(rows).toHaveLength(N)
    for (const r of rows) DocumentSchema.parse(r)
    expect(rows.map((r) => r.order)).toEqual([0, 1, 2, 3, 4])
  })

  it(`walks N = ${N} documents at limit ${L}: every id once, hasMore exact`, async () => {
    fakeWorkflow(N)
    const { seen, more } = await walk((p) => adapter.listDocuments(CREDS, WF, p))
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `doc-${i + 1}`))
    expect(more).toEqual([true, true, false])
  })

  it('getDocument reads back an id the list returned', async () => {
    fakeWorkflow(N)
    const doc = await adapter.getDocument(CREDS, `${WF}:doc-5`)
    expect(doc.id).toBe('doc-5')
    expect(doc.order).toBe(4)
  })
})
