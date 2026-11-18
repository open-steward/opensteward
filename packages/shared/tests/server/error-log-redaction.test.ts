/**
 * Negative test for the credential-in-logs leak.
 *
 * Every adapter client bakes the connection's live credential into its axios
 * instance (`axios.create({ headers: { Authorization: \`Bearer ${accessToken}\` } })`),
 * so every AxiosError it throws carries that credential on `err.config.headers`.
 * Fastify's default error handler logs `{ req, res, err }` whole, and pino's
 * standard err serializer copies an error's own enumerable properties —
 * `config` and `request` included — onto the log line verbatim.
 *
 * Without redaction that means an ordinary upstream 5xx on any of the 1,546
 * adapters writes a reusable customer token, and the outbound request body,
 * into stdout. These tests assert the leak does not happen — and that the
 * fields worth keeping (method, URL, upstream status) survive, so the
 * redaction stays useful to whoever is reading the log.
 */
import { describe, it, expect } from 'vitest'
import Fastify from 'fastify'
import { buildLoggerConfig } from '../../src/server/create-server'

/** Every secret in the fixture carries this marker, so one assertion covers them all. */
const LEAK = 'DO-NOT-LOG'

function axiosErrorLike(): Error {
  return Object.assign(new Error('Request failed with status code 502'), {
    name: 'AxiosError',
    isAxiosError: true,
    config: {
      method: 'get',
      url: 'https://api.fortnox.se/3/invoices',
      headers: {
        Authorization: `Bearer live-customer-token-${LEAK}`,
        'Access-Token': `legacy-header-token-${LEAK}`,
      },
      params: { client_secret: `query-secret-${LEAK}` },
      auth: { username: 'api', password: `basic-auth-${LEAK}` },
      data: `{"payload":"outbound-body-${LEAK}"}`,
    },
    request: {
      _header: `GET /3/invoices HTTP/1.1\r\nAuthorization: Bearer live-customer-token-${LEAK}\r\n`,
    },
    response: {
      status: 502,
      headers: { 'set-cookie': `upstream-session-${LEAK}` },
      data: { message: 'Bad gateway' },
      config: { headers: { Authorization: `Bearer live-customer-token-${LEAK}` } },
    },
  })
}

/** Boot a Fastify app wired exactly as the shared factory wires one, throw an
 *  adapter-style error from a route, and hand back everything it logged. */
async function captureAdapterErrorLog(): Promise<{ logs: string; body: string }> {
  const lines: string[] = []
  const stream = { write: (s: string) => void lines.push(s) }
  const loggerConfig = buildLoggerConfig(true)
  const fastify = Fastify({ logger: { ...(loggerConfig as object), stream } })
  fastify.get('/invoices', async () => {
    throw axiosErrorLike()
  })
  const res = await fastify.inject({ method: 'GET', url: '/invoices' })
  await fastify.close()
  return { logs: lines.join(''), body: res.body }
}

describe('adapter error logging', () => {
  it('keeps the credential out of the log line when an upstream call fails', async () => {
    const { logs } = await captureAdapterErrorLog()
    expect(logs).not.toContain(LEAK)
  })

  it('keeps the credential out of the error response too', async () => {
    const { body } = await captureAdapterErrorLog()
    expect(body).not.toContain(LEAK)
  })

  it('still logs the method, URL and upstream status the operator needs', async () => {
    const { logs } = await captureAdapterErrorLog()
    expect(logs).toContain('https://api.fortnox.se/3/invoices')
    expect(logs).toContain('"method":"get"')
    expect(logs).toContain('"status":502')
  })
})
