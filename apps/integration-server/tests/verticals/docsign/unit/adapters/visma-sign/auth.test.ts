/**
 * Visma Sign request authentication (https://sign.visma.net/api/docs/v1/,
 * "Authentication"):
 *
 *   "Your Visma Sign API credentials consist of a public client identifier
 *   (UUIDv4), and a secret key (32 bytes, delivered base64 encoded).
 *   Organization level request authentication is done with a Amazon-style HMAC"
 *
 *   Content-MD5: base64(md5(body)), RFC 1864 (binary md5)
 *   Content-Type: 'application/json'
 *   Date: 'Mon, 07 Dec 2015 22:57:52 +0200' (RFC 2822)
 *   Authorization: 'Onnistuu ' + client_identifier + ':' +
 *     base64(sha512_hmac(join('\n', [http_verb, Content-MD5, Content-Type,
 *     Date, http_path]), key))   // key "in binary, remember to decode base64"
 *
 * The adapter used to send a Visma Connect OAuth bearer, which that API does
 * not accept, so no read could reach it.
 */
import { describe, it, expect, vi, afterEach, beforeAll, afterAll } from 'vitest'
import { createHash, createHmac } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import axios from 'axios'
import { withPageSink, _resetRowPager } from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import {
  credentialFields,
  exchangeCredentials,
  signVismaSignRequest,
} from '../../../../../../src/verticals/docsign/adapters/visma-sign/auth'
import { VismaSignAdapter } from '../../../../../../src/verticals/docsign/adapters/visma-sign'
import { documentStatus, invitationTemplate } from './fixtures'

/** "Credentials used in the example header calculation, not real". */
const EXAMPLE_ID = 'ddf58116-6082-4bfc-a775-0c0bb2f945ce'
const EXAMPLE_SECRET = 'jp7SjOOr4czRTifCo30qx0sZAIw9PW+vVpsbP09pQaY='
const CREDS: Credentials = { accessToken: EXAMPLE_SECRET, extra: { clientIdentifier: EXAMPLE_ID } }

const adapter = new VismaSignAdapter({})

describe('signVismaSignRequest', () => {
  it('reproduces the documented example header calculation byte for byte', () => {
    const headers = signVismaSignRequest({
      method: 'POST',
      path: '/api/v1/document/',
      body: '{"document":{"name":"Test"}}',
      date: 'Tue, 16 May 2017 10:18:18 +0300',
      clientIdentifier: EXAMPLE_ID,
      secret: EXAMPLE_SECRET,
    })
    expect(headers).toEqual({
      'Content-MD5': 'Oum89929i6pTiBeDIOU+4A==',
      'Content-Type': 'application/json',
      Date: 'Tue, 16 May 2017 10:18:18 +0300',
      Authorization:
        'Onnistuu ddf58116-6082-4bfc-a775-0c0bb2f945ce:7s+Vee4VG0pObH/GkFpi4DAP1naaaPrPVzOytzbKRe9TBxB+LNzv03jySVFXeFyNJRUY8HRtdlY4e10QpAIFhg==',
    })
  })

  it('hashes the empty body ("Include even for empty string body")', () => {
    const headers = signVismaSignRequest({
      method: 'GET',
      path: '/api/v1/invitation-template',
      body: '',
      date: 'Tue, 16 May 2017 10:18:18 +0300',
      clientIdentifier: EXAMPLE_ID,
      secret: EXAMPLE_SECRET,
    })
    expect(headers['Content-MD5']).toBe(createHash('md5').update('').digest('base64'))
  })
})

describe('Visma Sign credential form', () => {
  it('asks for the client identifier and the secret key', () => {
    const fields = credentialFields()
    expect(fields.map((f) => [f.name, f.type, f.required])).toEqual([
      ['clientIdentifier', 'text', true],
      ['secret', 'password', true],
    ])
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['clientIdentifier', 'secret'])
  })

  it('stores the secret as accessToken and the identifier in extra', async () => {
    await expect(
      adapter.exchangeCredentials({ clientIdentifier: EXAMPLE_ID, secret: EXAMPLE_SECRET }),
    ).resolves.toEqual({ accessToken: EXAMPLE_SECRET, extra: { clientIdentifier: EXAMPLE_ID } })
  })

  it('trims pasted whitespace', async () => {
    await expect(
      exchangeCredentials({ clientIdentifier: ` ${EXAMPLE_ID}\n`, secret: ` ${EXAMPLE_SECRET} ` }),
    ).resolves.toEqual({ accessToken: EXAMPLE_SECRET, extra: { clientIdentifier: EXAMPLE_ID } })
  })

  it.each([
    ['a missing identifier', { secret: EXAMPLE_SECRET }, /client identifier/],
    ['a missing secret', { clientIdentifier: EXAMPLE_ID }, /secret/],
    [
      'an identifier that is not a UUID',
      { clientIdentifier: 'acme', secret: EXAMPLE_SECRET },
      /UUID/,
    ],
    [
      'a secret that is not base64',
      { clientIdentifier: EXAMPLE_ID, secret: 'not base64 at all!' },
      /32 bytes/,
    ],
    [
      'a secret that is not 32 bytes',
      { clientIdentifier: EXAMPLE_ID, secret: Buffer.alloc(16).toString('base64') },
      /32 bytes/,
    ],
    [
      'a secret that decodes to 32 bytes but is not the delivered base64 (padding dropped)',
      { clientIdentifier: EXAMPLE_ID, secret: EXAMPLE_SECRET.replace(/=$/, '') },
      /32 bytes/,
    ],
    [
      'a secret in base64url, which decodes to 32 bytes but was not delivered that way',
      { clientIdentifier: EXAMPLE_ID, secret: EXAMPLE_SECRET.replace('+', '-') },
      /32 bytes/,
    ],
    [
      'an identifier with a UUID at its end',
      { clientIdentifier: `x${EXAMPLE_ID}`, secret: EXAMPLE_SECRET },
      /UUID/,
    ],
    [
      'an identifier with a UUID at its start',
      { clientIdentifier: `${EXAMPLE_ID}x`, secret: EXAMPLE_SECRET },
      /UUID/,
    ],
  ])('rejects %s', async (_name, fields, message) => {
    await expect(exchangeCredentials(fields as Record<string, string>)).rejects.toThrow(message)
  })

  it('has no OAuth redirect, code exchange or refresh', async () => {
    expect(() => adapter.getAuthUrl('state')).toThrow(/credentialFields/)
    await expect(adapter.exchangeCode('code', 'r')).rejects.toThrow(/credentialFields/)
    await expect(adapter.refreshCredentials(CREDS)).resolves.toBe(CREDS)
  })
})

// ── On the wire ────────────────────────────────────────────────────────────

interface Captured {
  method: string
  url: string
  headers: IncomingMessage['headers']
  body: string
}

let server: Server
let origin = ''
const captured: Captured[] = []
let reply: (req: Captured) => unknown = () => ({})

function handler(req: IncomingMessage, res: ServerResponse): void {
  const chunks: Buffer[] = []
  req.on('data', (c: Buffer) => chunks.push(c))
  req.on('end', () => {
    const c: Captured = {
      method: req.method ?? '',
      url: req.url ?? '',
      headers: req.headers,
      body: Buffer.concat(chunks).toString('utf8'),
    }
    captured.push(c)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(reply(c)))
  })
}

beforeAll(async () => {
  server = createServer(handler)
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()))
})

afterEach(() => {
  vi.restoreAllMocks()
  captured.length = 0
  reply = () => ({})
  _resetRowPager()
})

/** Point the client's axios instance at the local server, keeping everything else. */
function routeToServer(): ReturnType<typeof vi.spyOn> {
  const real = axios.create.bind(axios)
  return vi.spyOn(axios, 'create').mockImplementation((cfg) => {
    expect(cfg?.baseURL).toBe('https://sign.visma.net')
    return real({ ...cfg, baseURL: origin })
  })
}

/** Recompute the documented Authorization independently of the adapter. */
function expectedAuthorization(c: Captured): string {
  const md5 = createHash('md5').update(c.body).digest('base64')
  const toSign = [c.method, md5, 'application/json', String(c.headers['date']), c.url].join('\n')
  const mac = createHmac('sha512', Buffer.from(EXAMPLE_SECRET, 'base64'))
    .update(toSign)
    .digest('base64')
  return `Onnistuu ${EXAMPLE_ID}:${mac}`
}

function expectSigned(c: Captured): void {
  expect(c.headers['authorization']).toBe(expectedAuthorization(c))
  expect(c.headers['content-md5']).toBe(createHash('md5').update(c.body).digest('base64'))
  expect(c.headers['content-type']).toBe('application/json')
  // RFC 2822 date, e.g. "Tue, 16 May 2017 07:18:18 GMT".
  expect(String(c.headers['date'])).toMatch(
    /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/,
  )
  expect(String(c.headers['authorization'])).not.toMatch(/Bearer/)
}

describe('VismaSignAdapter signs every request it sends', () => {
  it('listEnvelopes signs the path with its query string', async () => {
    routeToServer()
    reply = () => ({ total: 1, offset: 0, length: 1, documents: [documentStatus()] })
    const rows = await adapter.listEnvelopes(CREDS, withPageSink({ page: 1, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual([documentStatus().uuid])
    expect(captured).toHaveLength(1)
    expect(captured[0]!.method).toBe('GET')
    expect(captured[0]!.url).toBe('/api/v1/document/?category=all&offset=0')
    expectSigned(captured[0]!)
  })

  it('getEnvelope signs GET /api/v1/document/{uuid}', async () => {
    routeToServer()
    reply = () => documentStatus()
    await adapter.getEnvelope(CREDS, documentStatus().uuid)
    expect(captured[0]!.url).toBe(`/api/v1/document/${documentStatus().uuid}`)
    expectSigned(captured[0]!)
  })

  it('getSigner signs GET /api/v1/invitation/{uuid}', async () => {
    routeToServer()
    reply = () => ({ ...documentStatus().invitations![0], document: { uuid: 'doc-1', name: 'x' } })
    await adapter.getSigner(CREDS, '2076243e-351d-4b29-86ad-c2b02d7f867d')
    expect(captured[0]!.url).toBe('/api/v1/invitation/2076243e-351d-4b29-86ad-c2b02d7f867d')
    expectSigned(captured[0]!)
  })

  it('listTemplates signs GET /api/v1/invitation-template', async () => {
    routeToServer()
    reply = () => [invitationTemplate()]
    await adapter.listTemplates(CREDS, withPageSink({ page: 1, limit: 5 }))
    expect(captured[0]!.url).toBe('/api/v1/invitation-template')
    expectSigned(captured[0]!)
  })

  it('voidEnvelope signs POST /api/v1/document/{uuid}/cancel ("Cancel a document")', async () => {
    routeToServer()
    reply = (c) => (c.method === 'POST' ? {} : documentStatus())
    await adapter.voidEnvelope(CREDS, documentStatus().uuid)
    expect(captured.map((c) => `${c.method} ${c.url}`)).toEqual([
      `POST /api/v1/document/${documentStatus().uuid}/cancel`,
      `GET /api/v1/document/${documentStatus().uuid}`,
    ])
    captured.forEach(expectSigned)
  })

  it('a connection without a client identifier asks for a reconnect and sends nothing', async () => {
    routeToServer()
    const legacy = { accessToken: 'visma-connect-bearer', refreshToken: 'rt' } as Credentials
    await expect(adapter.getEnvelope(legacy, 'doc-1')).rejects.toThrow(/reconnect/)
    expect(captured).toHaveLength(0)
  })

  it('a connection with an identifier but no secret asks for a reconnect and sends nothing', async () => {
    routeToServer()
    const noSecret = { accessToken: '', extra: { clientIdentifier: EXAMPLE_ID } } as Credentials
    await expect(adapter.getEnvelope(noSecret, 'doc-1')).rejects.toThrow(/reconnect/)
    expect(captured).toHaveLength(0)
  })

  it('a retried request is signed again with a fresh Date', async () => {
    routeToServer()
    let calls = 0
    server.removeAllListeners('request')
    server.on('request', (req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c: Buffer) => chunks.push(c))
      req.on('end', () => {
        captured.push({
          method: req.method ?? '',
          url: req.url ?? '',
          headers: req.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        })
        res.setHeader('Content-Type', 'application/json')
        if (calls++ === 0) {
          res.statusCode = 503
          res.end('{}')
        } else {
          res.end(JSON.stringify(documentStatus()))
        }
      })
    })
    try {
      await adapter.getEnvelope(CREDS, documentStatus().uuid)
    } finally {
      server.removeAllListeners('request')
      server.on('request', handler)
    }
    expect(captured).toHaveLength(2)
    captured.forEach(expectSigned)
    // The retry waits >= 1s, so a Date computed per attempt differs by a second.
    expect(captured[1]!.headers['date']).not.toBe(captured[0]!.headers['date'])
  }, 10_000)
})
