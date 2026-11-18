/**
 * Object-store sinks without a network: the S3 sink against a fake client
 * (prefix, content type, custom endpoint + path style, credentials, host
 * guard), the host guard itself, and the sink factory's type dispatch.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { createS3Sink, type S3ClientLike } from '../src/sinks/s3'
import { createSink } from '../src/sinks'
import {
  assertDestinationHosts,
  createHostGuard,
  destinationHosts,
  parseHostAllowList,
} from '../src/hosts'
import { S3ConfigSchema } from '../src/types'
import { destinationCatalog } from '../src/catalog'

const allowAll = async () => {}

function fakeS3() {
  const sent: unknown[] = []
  const built: unknown[] = []
  let destroyed = false
  const client: S3ClientLike = {
    async send(cmd) {
      sent.push(cmd)
      return {}
    },
    destroy() {
      destroyed = true
    },
  }
  return {
    sent,
    built,
    get destroyed() {
      return destroyed
    },
    clientFactory: async (cfg: unknown) => {
      built.push(cfg)
      return client
    },
    putCommand: async (input: unknown) => ({ put: input }),
  }
}

describe('S3 sink', () => {
  it('puts each file under the prefix with its content type', async () => {
    const f = fakeS3()
    const sink = await createS3Sink(
      S3ConfigSchema.parse({ bucket: 'lake', prefix: 'exports/prod' }),
      { accessKeyId: 'AK', secretAccessKey: 'SK' },
      { hostGuard: allowAll, clientFactory: f.clientFactory, putCommand: f.putCommand },
    )
    await sink.writeFile(
      'vertical=crm/x.parquet',
      new Uint8Array([1, 2]),
      'application/vnd.apache.parquet',
    )
    expect(f.sent).toEqual([
      {
        put: {
          Bucket: 'lake',
          Key: 'exports/prod/vertical=crm/x.parquet',
          Body: new Uint8Array([1, 2]),
          ContentType: 'application/vnd.apache.parquet',
        },
      },
    ])
    expect(f.built).toEqual([
      {
        region: 'us-east-1',
        endpoint: undefined,
        forcePathStyle: false,
        credentials: { accessKeyId: 'AK', secretAccessKey: 'SK' },
      },
    ])
    await sink.test()
    expect((f.sent[1] as { put: { Key: string } }).put.Key).toBe(
      'exports/prod/_opensteward/connection-test.json',
    )
    await sink.close()
    expect(f.destroyed).toBe(true)
  })

  it('passes a custom endpoint and path style (MinIO/R2), default chain without keys', async () => {
    const f = fakeS3()
    const guarded: string[] = []
    await createS3Sink(
      S3ConfigSchema.parse({
        bucket: 'lake',
        endpoint: 'http://minio:9000',
        forcePathStyle: true,
        region: 'auto',
      }),
      {},
      {
        hostGuard: async (h) => {
          guarded.push(h)
        },
        clientFactory: f.clientFactory,
        putCommand: f.putCommand,
      },
    )
    expect(guarded).toEqual(['minio'])
    expect(f.built[0]).toEqual({
      region: 'auto',
      endpoint: 'http://minio:9000',
      forcePathStyle: true,
      credentials: undefined,
    })
  })

  it('refuses before building a client when the guard rejects the endpoint', async () => {
    const f = fakeS3()
    await expect(
      createS3Sink(
        S3ConfigSchema.parse({ bucket: 'lake', endpoint: 'http://169.254.169.254' }),
        {},
        {
          hostGuard: async () => {
            throw new Error('blocked')
          },
          clientFactory: f.clientFactory,
        },
      ),
    ).rejects.toThrow('blocked')
    expect(f.built).toEqual([])
  })

  it('builds a real S3 sink through the factory (no request is made)', async () => {
    const sink = await createSink(
      's3',
      S3ConfigSchema.parse({ bucket: 'lake', endpoint: 'http://minio:9000', forcePathStyle: true }),
      { accessKeyId: 'a', secretAccessKey: 'b' },
      { hostGuard: allowAll },
    )
    expect(sink.kind).toBe('object_store')
    await sink.close()
    await expect(createSink('oracle', {}, {}, { hostGuard: allowAll })).rejects.toThrow(
      /not supported/,
    )
  })
})

describe('host guard', () => {
  afterEach(() => setDnsResolver(undefined))

  it('parses the allow-list', () => {
    expect(parseHostAllowList(' MinIO, db.internal ,,')).toEqual(['minio', 'db.internal'])
    expect(parseHostAllowList(undefined)).toEqual([])
  })

  it('refuses private addresses unless allow-listed', async () => {
    const prev = process.env['OST_ALLOW_PRIVATE_HOSTS']
    delete process.env['OST_ALLOW_PRIVATE_HOSTS']
    try {
      setDnsResolver(async (host: string) =>
        host === 'minio'
          ? [{ address: '10.0.0.5', family: 4 }]
          : [{ address: '93.184.216.34', family: 4 }],
      )
      const strict = createHostGuard([])
      await expect(strict('minio')).rejects.toThrow()
      await expect(strict('127.0.0.1')).rejects.toThrow()
      await expect(strict('[::1]')).rejects.toThrow()
      await expect(strict('example.com')).resolves.toBeUndefined()
      const lenient = createHostGuard(() => ['MINIO'])
      await expect(lenient('minio')).resolves.toBeUndefined()
      await expect(lenient('127.0.0.1')).rejects.toThrow()
    } finally {
      if (prev !== undefined) process.env['OST_ALLOW_PRIVATE_HOSTS'] = prev
    }
  })

  it('knows which hosts each type dials', async () => {
    expect(destinationHosts('s3', { endpoint: 'https://r2.example.com:443' })).toEqual([
      'r2.example.com',
    ])
    expect(destinationHosts('s3', {})).toEqual([])
    expect(destinationHosts('gcs', { apiEndpoint: 'http://fake-gcs:4443' })).toEqual(['fake-gcs'])
    expect(destinationHosts('azure_blob', { endpoint: 'http://azurite:10000/acct' })).toEqual([
      'azurite',
    ])
    expect(destinationHosts('postgres', { host: 'db.example.com' })).toEqual(['db.example.com'])
    const seen: string[] = []
    await assertDestinationHosts(async (h) => void seen.push(h), 'postgres', { host: 'db' })
    expect(seen).toEqual(['db'])
  })
})

describe('catalog', () => {
  it('describes every type; loaders are available, iceberg is experimental', () => {
    const cat = destinationCatalog()
    expect(cat.map((c) => [c.type, c.kind, c.available, c.experimental])).toEqual([
      ['s3', 'object_store', true, false],
      ['gcs', 'object_store', true, false],
      ['azure_blob', 'object_store', true, false],
      ['postgres', 'table', true, false],
      ['snowflake', 'loader', true, false],
      ['bigquery', 'loader', true, false],
      ['databricks', 'loader', true, false],
      ['iceberg', 'loader', true, true],
    ])
    for (const entry of cat) {
      expect(entry.configSchema, entry.type).toMatchObject({ type: 'object' })
      expect(entry.secretsSchema, entry.type).toMatchObject({ type: 'object' })
    }
    const sf = cat.find((c) => c.type === 'snowflake')!
    expect(sf.secretFields).toEqual(
      expect.arrayContaining(['username', 'password', 'privateKey', 'stageAccessKeyId']),
    )
    const sfProps = (sf.configSchema as { properties: Record<string, unknown> }).properties
    expect(Object.keys(sfProps)).toEqual(
      expect.arrayContaining(['account', 'warehouse', 'database', 'schema', 'role', 'stage']),
    )
    expect(cat.find((c) => c.type === 'bigquery')!.secretFields).toEqual(['serviceAccountJson'])
    const s3 = cat.find((c) => c.type === 's3')!
    expect(s3.secretFields.sort()).toEqual(['accessKeyId', 'secretAccessKey', 'sessionToken'])
    const props = (s3.configSchema as { properties: Record<string, { description?: string }> })
      .properties
    expect(Object.keys(props)).toEqual(
      expect.arrayContaining(['bucket', 'region', 'prefix', 'endpoint', 'forcePathStyle']),
    )
    expect(props['endpoint']!.description).toMatch(/MinIO/)
    const pg = cat.find((c) => c.type === 'postgres')!
    expect(pg.secretFields).toEqual(['password'])
    expect(pg.kind).toBe('table')
  })
})
