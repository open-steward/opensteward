import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, readdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { generate } from '../scripts/generate-commands'

const FIXTURE_ADMIN = {
  openapi: '3.0.3',
  info: { title: 'admin-api (fixture)' },
  paths: {
    '/api/users': {
      get: {
        operationId: 'users.list',
        summary: 'List users',
        tags: ['users'],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['data'],
                  properties: {
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          username: { type: 'string' },
                          role: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        operationId: 'users.create',
        summary: 'Create a user',
        tags: ['users'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password', 'role'],
                properties: {
                  username: { type: 'string' },
                  password: { type: 'string' },
                  role: { type: 'string', enum: ['admin', 'operator', 'viewer'] },
                  metadata: {
                    type: 'object',
                    properties: {
                      name: { type: 'string' },
                      email: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { data: { type: 'object' } },
                },
              },
            },
          },
        },
      },
    },
    '/api/users/{id}': {
      delete: {
        operationId: 'users.delete',
        summary: 'Delete a user',
        tags: ['users'],
        parameters: [
          { in: 'path', name: 'id', required: true, schema: { type: 'string' } },
        ],
        responses: {
          '204': { description: 'No content' },
        },
      },
    },
    '/api/platforms/{vertical}/{slug}': {
      get: {
        operationId: 'platforms.config.get',
        summary: 'Get config',
        tags: ['platforms'],
        parameters: [
          { in: 'path', name: 'vertical', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'slug', required: true, schema: { type: 'string' } },
          { in: 'query', name: 'includeSecrets', schema: { type: 'boolean' } },
          { in: 'query', name: 'limit', schema: { type: 'integer' } },
        ],
        responses: {
          '200': { content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    '/no-op-id': {
      get: {
        summary: 'no operationId',
        responses: { '200': {} },
      },
    },
  },
}

const FIXTURE_PUBLIC = {
  openapi: '3.0.3',
  info: { title: 'public (fixture)' },
  paths: {
    '/v1/widgets': {
      get: {
        operationId: 'widgets.list',
        tags: ['widgets'],
        responses: {
          '200': {
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { id: { type: 'string' }, name: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
}

describe('generate-commands', () => {
  let outDir: string

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'cli-gen-'))
  })
  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true })
  })

  it('emits one module per tag with the expected commands', async () => {
    const r = await generate({ adminSpec: FIXTURE_ADMIN, publicSpec: FIXTURE_PUBLIC, outDir })
    const tags = r.modulesEmitted.map((m) => m.tag).sort()
    expect(tags).toEqual(['platforms', 'users', 'widgets'])
    const commandPaths = r.cmds.map((c) => c.commandPath.join(' ')).sort()
    expect(commandPaths).toEqual([
      'platforms config get',
      'users create',
      'users delete',
      'users list',
      'widgets list',
    ])
  })

  it('marks body fields required when the JSON schema lists them', async () => {
    const r = await generate({ adminSpec: FIXTURE_ADMIN, publicSpec: FIXTURE_PUBLIC, outDir })
    const create = r.cmds.find((c) => c.operationId === 'users.create')!
    const usernameFlag = create.flags.find((f) => f.name === 'username')
    expect(usernameFlag).toBeDefined()
    expect(usernameFlag!.required).toBe(true)
    const role = create.flags.find((f) => f.name === 'role')
    expect(role!.choices).toEqual(['admin', 'operator', 'viewer'])
  })

  it('flattens one-level nested body objects into hyphenated flags', async () => {
    const r = await generate({ adminSpec: FIXTURE_ADMIN, publicSpec: FIXTURE_PUBLIC, outDir })
    const create = r.cmds.find((c) => c.operationId === 'users.create')!
    const names = create.flags.map((f) => f.name)
    expect(names).toContain('metadata-name')
    expect(names).toContain('metadata-email')
  })

  it('emits path args as positional and query as flags', async () => {
    const r = await generate({ adminSpec: FIXTURE_ADMIN, publicSpec: FIXTURE_PUBLIC, outDir })
    const cfg = r.cmds.find((c) => c.operationId === 'platforms.config.get')!
    expect(cfg.pathArgs.map((a) => a.name)).toEqual(['vertical', 'slug'])
    expect(cfg.flags.map((f) => f.name).sort()).toEqual(['include-secrets', 'limit'])
    const limit = cfg.flags.find((f) => f.name === 'limit')!
    expect(limit.coerce).toBe('integer')
    const incl = cfg.flags.find((f) => f.name === 'include-secrets')!
    expect(incl.coerce).toBe('boolean')
  })

  it('skips operations with no operationId and warns', async () => {
    const r = await generate({ adminSpec: FIXTURE_ADMIN, publicSpec: FIXTURE_PUBLIC, outDir })
    // The /no-op-id route should NOT appear.
    expect(r.cmds.find((c) => c.pathTemplate === '/no-op-id')).toBeUndefined()
  })

  it('detects table renderer + columns for envelope-wrapped list responses', async () => {
    const r = await generate({ adminSpec: FIXTURE_ADMIN, publicSpec: FIXTURE_PUBLIC, outDir })
    const list = r.cmds.find((c) => c.operationId === 'users.list')!
    expect(list.renderer).toBe('table')
    expect(list.responseUnwrap).toEqual(['data'])
    expect(list.tableColumns).toContain('id')
    expect(list.tableColumns).toContain('username')
  })

  it('writes a manifest.json listing every command', async () => {
    await generate({ adminSpec: FIXTURE_ADMIN, publicSpec: FIXTURE_PUBLIC, outDir })
    const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8')) as Array<{
      command: string
      operationId: string
    }>
    expect(manifest.length).toBe(5)
    expect(manifest.map((m) => m.operationId).sort()).toEqual([
      'platforms.config.get',
      'users.create',
      'users.delete',
      'users.list',
      'widgets.list',
    ])
  })

  it('emits a re-exporting index.ts', async () => {
    await generate({ adminSpec: FIXTURE_ADMIN, publicSpec: FIXTURE_PUBLIC, outDir })
    const idx = readFileSync(join(outDir, 'index.ts'), 'utf8')
    // Quote style is decided by prettier (this file is emitted through
    // formatTypeScript before it hits disk), not hard-coded by the
    // template — match either quote character so this doesn't pin a
    // cosmetic formatting detail.
    expect(idx).toMatch(/from ['"]\.\/users\.js['"]/)
    expect(idx).toMatch(/from ['"]\.\/platforms\.js['"]/)
    expect(idx).toMatch(/from ['"]\.\/widgets\.js['"]/)
    expect(idx).toContain('export function allCommands')
  })

  it('throws on command-path collisions', async () => {
    const collisionSpec = {
      ...FIXTURE_ADMIN,
      paths: {
        ...FIXTURE_ADMIN.paths,
        '/api/users/dup': {
          get: { operationId: 'users.list', tags: ['users'], responses: { '200': {} } },
        },
      },
    }
    // The detector logs the offending path via console.error before throwing;
    // silence it here so the expected-failure path doesn't spam the test output.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(
        generate({ adminSpec: collisionSpec, publicSpec: { paths: {} }, outDir }),
      ).rejects.toThrow(/collision/)
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("command path collision 'users list'"))
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('lists writes one .ts file per tag in the output dir', async () => {
    await generate({ adminSpec: FIXTURE_ADMIN, publicSpec: FIXTURE_PUBLIC, outDir })
    const files = readdirSync(outDir).sort()
    expect(files).toEqual(['index.ts', 'manifest.json', 'platforms.ts', 'users.ts', 'widgets.ts'])
  })
})

// ── Discriminated-union (oneOf + discriminator) expansion ─────────────

const FIXTURE_DISCRIMINATED = {
  openapi: '3.0.3',
  info: { title: 'admin-api (discriminated fixture)' },
  paths: {
    // Case A: body root IS the discriminated union.
    '/api/identity-providers': {
      post: {
        operationId: 'identity-providers.create',
        summary: 'Create an identity provider',
        tags: ['identity-providers'],
        requestBody: {
          required: true,
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CreateIdpBody' } },
          },
        },
        responses: {
          '201': { content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
    // Case B: union is nested under a top-level body field.
    '/api/verticals/{vertical}/platforms/{slug}/enable': {
      post: {
        operationId: 'platforms.enable',
        summary: 'Enable a platform',
        tags: ['platforms'],
        parameters: [
          { in: 'path', name: 'vertical', required: true, schema: { type: 'string' } },
          { in: 'path', name: 'slug', required: true, schema: { type: 'string' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { config: { $ref: '#/components/schemas/PlatformConfig' } },
                required: ['config'],
              },
            },
          },
        },
        responses: {
          '200': { content: { 'application/json': { schema: { type: 'object' } } } },
        },
      },
    },
  },
  components: {
    schemas: {
      CreateIdpBody: {
        oneOf: [
          { $ref: '#/components/schemas/CreateOidcBody' },
          { $ref: '#/components/schemas/CreateSamlBody' },
        ],
        type: 'object',
        discriminator: {
          propertyName: 'protocol',
          mapping: {
            oidc: '#/components/schemas/CreateOidcBody',
            saml: '#/components/schemas/CreateSamlBody',
          },
        },
      },
      CreateOidcBody: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          slug: { type: 'string' },
          protocol: { type: 'string', const: 'oidc' },
          issuer: { type: 'string' },
        },
        required: ['name', 'slug', 'protocol', 'issuer'],
      },
      CreateSamlBody: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          slug: { type: 'string' },
          protocol: { type: 'string', const: 'saml' },
          entryPoint: { type: 'string' },
        },
        required: ['name', 'slug', 'protocol', 'entryPoint'],
      },
      PlatformConfig: {
        oneOf: [
          { $ref: '#/components/schemas/PcOauth2' },
          { $ref: '#/components/schemas/PcApiKey' },
        ],
        type: 'object',
        discriminator: {
          propertyName: 'authType',
          mapping: {
            oauth2: '#/components/schemas/PcOauth2',
            api_key: '#/components/schemas/PcApiKey',
          },
        },
      },
      PcOauth2: {
        type: 'object',
        properties: {
          authType: { type: 'string', const: 'oauth2' },
          clientId: { type: 'string' },
          clientSecret: { type: 'string' },
          redirectUri: { type: 'string' },
        },
        required: ['authType', 'clientId', 'clientSecret'],
      },
      PcApiKey: {
        type: 'object',
        properties: {
          authType: { type: 'string', const: 'api_key' },
          apiKey: { type: 'string' },
        },
        required: ['authType', 'apiKey'],
      },
    },
  },
}

describe('generate-commands — discriminated unions', () => {
  let outDir: string

  beforeEach(() => {
    outDir = mkdtempSync(join(tmpdir(), 'cli-gen-disc-'))
  })
  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true })
  })

  it('emits a discriminator selector with choices when the body root is a oneOf', async () => {
    const r = await generate({ adminSpec: FIXTURE_DISCRIMINATED, publicSpec: { paths: {} }, outDir })
    const cmd = r.cmds.find((c) => c.operationId === 'identity-providers.create')!
    const protocol = cmd.flags.find((f) => f.name === 'protocol')!
    expect(protocol).toBeDefined()
    expect(protocol.location).toBe('body-discriminator')
    expect(protocol.choices).toEqual(['oidc', 'saml'])
    expect(protocol.required).toBe(true)
    expect(protocol.bodyPath).toEqual(['protocol'])
  })

  it('expands per-branch fields with collision-aware naming', async () => {
    const r = await generate({ adminSpec: FIXTURE_DISCRIMINATED, publicSpec: { paths: {} }, outDir })
    const cmd = r.cmds.find((c) => c.operationId === 'identity-providers.create')!
    const names = cmd.flags.map((f) => f.name)
    // name + slug collide across oidc + saml → prefixed.
    expect(names).toContain('protocol-oidc-name')
    expect(names).toContain('protocol-saml-name')
    expect(names).toContain('protocol-oidc-slug')
    expect(names).toContain('protocol-saml-slug')
    // issuer is only on oidc → flat.
    expect(names).toContain('issuer')
    // entryPoint is only on saml → flat.
    expect(names).toContain('entry-point')
  })

  it('marks per-branch flags as discriminator-gated', async () => {
    const r = await generate({ adminSpec: FIXTURE_DISCRIMINATED, publicSpec: { paths: {} }, outDir })
    const cmd = r.cmds.find((c) => c.operationId === 'identity-providers.create')!
    const issuer = cmd.flags.find((f) => f.name === 'issuer')!
    expect(issuer.location).toBe('body-discriminated')
    expect(issuer.discriminatorFlag).toBe('protocol')
    expect(issuer.discriminatorValue).toBe('oidc')
    expect(issuer.discriminatorPath).toEqual(['protocol'])
    // Required within its branch — runtime enforces conditionally.
    expect(issuer.required).toBe(true)
  })

  it('expands a discriminated union nested under a body field with the right body path', async () => {
    const r = await generate({ adminSpec: FIXTURE_DISCRIMINATED, publicSpec: { paths: {} }, outDir })
    const cmd = r.cmds.find((c) => c.operationId === 'platforms.enable')!
    const selector = cmd.flags.find((f) => f.location === 'body-discriminator')!
    expect(selector.name).toBe('config-auth-type')
    expect(selector.bodyPath).toEqual(['config', 'authType'])
    expect(selector.choices).toEqual(['oauth2', 'api_key'])
    // Collisions on clientId would only be across branches that have
    // both. Here clientId is only on oauth2 → flat.
    const names = cmd.flags.map((f) => f.name)
    expect(names).toContain('client-id')
    expect(names).toContain('client-secret')
    expect(names).toContain('redirect-uri')
    expect(names).toContain('api-key')
    const clientId = cmd.flags.find((f) => f.name === 'client-id')!
    expect(clientId.bodyPath).toEqual(['config', 'clientId'])
    expect(clientId.discriminatorFlag).toBe('config-auth-type')
    expect(clientId.discriminatorValue).toBe('oauth2')
  })

  it('emits a --body-json escape hatch alongside per-branch flags', async () => {
    const r = await generate({ adminSpec: FIXTURE_DISCRIMINATED, publicSpec: { paths: {} }, outDir })
    const cmd = r.cmds.find((c) => c.operationId === 'identity-providers.create')!
    const bodyJson = cmd.flags.find((f) => f.name === 'body-json')!
    expect(bodyJson).toBeDefined()
    expect(bodyJson.location).toBe('body-json')
  })
})
