/**
 * The multipart parser must not let a field name reach the parsed body's
 * prototype. A file part named `__proto__` assigned onto a plain object
 * becomes its prototype, and every lookup on the body then falls through to
 * attacker-chosen values.
 */
import { afterEach, describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { acceptMultipart } from '../../src/core/multipart'

let fastify: FastifyInstance | undefined

afterEach(async () => {
  await fastify?.close()
  fastify = undefined
})

function body(parts: Array<{ name: string; filename?: string; value: string }>, boundary = 'xyz') {
  return (
    parts
      .map(
        (p) =>
          `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"` +
          (p.filename ? `; filename="${p.filename}"\r\nContent-Type: image/png` : '') +
          `\r\n\r\n${p.value}\r\n`,
      )
      .join('') + `--${boundary}--\r\n`
  )
}

async function parse(parts: Array<{ name: string; filename?: string; value: string }>) {
  fastify = Fastify({ logger: false })
  acceptMultipart(fastify, 64 * 1024)
  fastify.post('/p', async (request) => {
    const b = request.body as Record<string, unknown>
    return {
      nullPrototype: Object.getPrototypeOf(b) === null,
      keys: Object.keys(b),
      // Any of these being reachable means a field name reached the prototype.
      inherited: ['filename', 'bytes', 'contentType', 'polluted'].filter((k) => k in b && !Object.hasOwn(b, k)),
    }
  })
  await fastify.ready()
  const res = await fastify.inject({
    method: 'POST',
    url: '/p',
    headers: { 'content-type': 'multipart/form-data; boundary=xyz' },
    payload: body(parts),
  })
  return res.json() as { nullPrototype: boolean; keys: string[]; inherited: string[] }
}

describe('acceptMultipart', () => {
  it('keeps ordinary fields and files', async () => {
    const got = await parse([
      { name: '_csrf', value: 'tok' },
      { name: 'avatar', filename: 'a.png', value: 'PNG' },
    ])
    expect(got.keys).toEqual(['_csrf', 'avatar'])
  })

  it('never lets a file part named __proto__ become the body’s prototype', async () => {
    const got = await parse([
      { name: '_csrf', value: 'tok' },
      { name: '__proto__', filename: 'x.png', value: 'PNG' },
    ])
    expect(got.inherited).toEqual([])
    expect(got.nullPrototype).toBe(true)
    expect(got.keys).toEqual(['_csrf'])
  })

  it('drops constructor and prototype field names too', async () => {
    const got = await parse([
      { name: 'constructor', value: 'x' },
      { name: 'prototype', value: 'y' },
      { name: 'ok', value: 'z' },
    ])
    expect(got.keys).toEqual(['ok'])
  })
})
