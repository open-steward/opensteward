/**
 * `multipart/form-data` for the few forms that upload a file, without JS.
 *
 * Every other form here posts url-encoded fields; the company-info logo turns
 * a file into a data URL in the browser, which needs JavaScript. A profile
 * picture must upload from a plain `<form enctype="multipart/form-data">`, so
 * this parses the body with the platform's own parser (`Response.formData()`,
 * undici, shipped with Node) instead of adding `@fastify/multipart`.
 *
 * Registered on one route plugin at a time — never globally — with a hard
 * body limit, so only the routes that take a file accept a multipart body.
 * The parsed body is a plain object (`_csrf` stays a string field), so the
 * global CSRF hook reads it exactly as it reads a url-encoded one.
 */
import type { FastifyInstance } from 'fastify'

export interface UploadedFile {
  /** Browser-supplied; informational only. */
  filename: string
  /** Browser-supplied; never trusted — the server sniffs the bytes. */
  contentType: string
  bytes: Buffer
}

export type MultipartBody = Record<string, string | UploadedFile>

const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

export function isUploadedFile(value: unknown): value is UploadedFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    Buffer.isBuffer((value as UploadedFile).bytes) &&
    typeof (value as UploadedFile).filename === 'string'
  )
}

/**
 * Accept `multipart/form-data` on the routes of `fastify` (one encapsulated
 * plugin), up to `maxBytes` for the whole body. Over the limit is Fastify's
 * own 413; a body that does not parse is a 400.
 */
export function acceptMultipart(fastify: FastifyInstance, maxBytes: number): void {
  fastify.addContentTypeParser(
    'multipart/form-data',
    { parseAs: 'buffer', bodyLimit: maxBytes },
    (request, body, done) => {
      const contentType = String(request.headers['content-type'] ?? '')
      new Response(new Uint8Array(body as Buffer), { headers: { 'content-type': contentType } })
        .formData()
        .then(async (form) => {
          // A null-prototype object, and the three prototype-reaching names
          // dropped: a part named `__proto__` assigned onto `{}` would become
          // the body's prototype. The field names come from the client.
          const out = Object.create(null) as MultipartBody
          for (const [key, value] of form.entries()) {
            if (RESERVED_KEYS.has(key)) continue
            if (typeof value === 'string') {
              out[key] = value
            } else {
              out[key] = {
                filename: value.name,
                contentType: value.type,
                bytes: Buffer.from(await value.arrayBuffer()),
              }
            }
          }
          done(null, out)
        })
        .catch(() => {
          const err = new Error('Malformed multipart body') as Error & { statusCode: number }
          err.statusCode = 400
          done(err, undefined)
        })
    },
  )
}
