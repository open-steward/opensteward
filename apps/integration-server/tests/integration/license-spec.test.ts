/**
 * The public spec documents `/v1/capabilities` and the three license refusals.
 *
 * This reads the spec SOURCES in process, never the committed
 * `docs/openapi/openapi.json`: only the REGEN step publishes these into the
 * generated spec, SDK and Postman collection.
 *
 * What it catches: license fields leaking into the `Capabilities` schema, the
 * operation being made live-only (which would break the sandbox promise: the
 * sandbox serves `/test/v1/capabilities`) either by a `servers` key on the
 * source path item or by '/capabilities' in generate-openapi's
 * LIVE_ONLY_PATHS, and the refusal codes or the capabilities subsection
 * missing from the developer reference.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { controlPlanePaths, controlPlaneSchemas } from '../../scripts/control-plane-spec'
import { sharedResponses } from '../../scripts/shared-schemas'

type Operation = {
  operationId?: string
  security?: unknown
  responses: Record<string, Record<string, unknown>>
}

const LICENSE_CODES = ['LICENSE_FEATURE_NOT_ENTITLED', 'LICENSE_LIMIT_EXCEEDED', 'LICENSE_EXPIRED']

describe('the public spec documents capabilities and the license refusals (sources; REGEN publishes them)', () => {
  it('GET /v1/capabilities: any tenant key, on both servers, the Capabilities envelope', () => {
    const item = controlPlanePaths['/v1/capabilities'] as { get: Operation } & Record<
      string,
      unknown
    >
    expect(item.get.operationId).toBe('capabilities.get')
    expect(item.get.security).toEqual([{ ApiKeyAuth: [] }])
    expect(item.get.responses['200']).toEqual({
      description: 'OK',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['data'],
            properties: { data: { $ref: '#/components/schemas/Capabilities' } },
          },
        },
      },
    })
    expect(item.get.responses['403']).toEqual({ $ref: '#/components/responses/Forbidden' })
    // No server override: generate-openapi renders it under /test/v1 too, which the sandbox serves.
    expect(item['servers']).toBeUndefined()
  })

  it('Capabilities carries no license details', () => {
    const schema = controlPlaneSchemas['Capabilities'] as {
      required: string[]
      properties: Record<string, unknown>
    }
    expect(Object.keys(schema.properties)).toEqual(['verticals'])
    expect(schema.required).toEqual(['verticals'])
  })

  it('Forbidden documents the three license refusals', () => {
    const examples = sharedResponses.Forbidden.content['application/json'].examples as Record<
      string,
      { value: { code: string } }
    >
    expect(Object.values(examples).map((e) => e.value.code)).toEqual(
      expect.arrayContaining(LICENSE_CODES),
    )
  })

  it('docs/dev-api.md documents the refusals and capabilities', () => {
    const doc = readFileSync(
      resolve(__dirname, '..', '..', '..', '..', 'docs', 'dev-api.md'),
      'utf8',
    )
    const refusals = section(doc, '### License refusals')
    for (const code of LICENSE_CODES) expect(refusals).toContain(code)
    // The subsection itself, not the string anywhere: the refusal table and the
    // limits paragraph above it also mention GET /v1/capabilities.
    const capabilities = section(doc, '#### `GET /v1/capabilities`')
    expect(capabilities).toContain('{ "data": { "verticals": [...] } }')
    expect(capabilities).toContain('GET /v1/me/capabilities')
    expect(capabilities).toContain('GET /test/v1/capabilities')
    expect(capabilities).toContain('mcp:read')
    expect(capabilities).toContain('No license details are ever returned.')
  })

  it('generate-openapi does not mark /capabilities live-only', () => {
    // The real live-only switch: generate-openapi's LIVE_ONLY_PATHS (keyed after
    // the /v1 strip) gives a path a live-only server override. The script writes
    // files when imported, so its source is read instead. After REGEN,
    // spec-routes would not catch this either: a live-only path is never probed
    // in the sandbox.
    const source = readFileSync(
      resolve(__dirname, '..', '..', 'scripts', 'generate-openapi.ts'),
      'utf8',
    )
    const declared = /const LIVE_ONLY_PATHS = new Set<string>\(\[([^\]]*)\]\)/.exec(source)
    expect(declared, 'LIVE_ONLY_PATHS moved: update this test').not.toBeNull()
    const entries = [...declared![1]!.matchAll(/['"`]([^'"`]+)['"`]/g)].map((m) => m[1])
    expect(entries).not.toContain('/capabilities')
    expect(entries).not.toContain('/v1/capabilities')
  })
})

/** From `heading` to the next heading of the same or a higher level; '' when absent. */
function section(doc: string, heading: string): string {
  const lines = doc.split('\n')
  const start = lines.indexOf(heading)
  if (start === -1) return ''
  const level = /^#+/.exec(heading)![0].length
  const end = lines.findIndex(
    (l, i) => i > start && /^#+ /.test(l) && /^#+/.exec(l)![0].length <= level,
  )
  return lines.slice(start, end === -1 ? undefined : end).join('\n')
}
