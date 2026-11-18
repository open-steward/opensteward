/**
 * Staging-location URLs.
 *
 * A loader's `stage.url` names one object-store location in whichever
 * spelling the operator knows (`s3://`, `gs://`/`gcs://`, `azure://…blob…`,
 * `abfss://…dfs…`, `wasbs://…`). It is parsed once into its parts — what the
 * upload side needs — and rendered back in the spelling each warehouse
 * expects. Every part is held to a strict character set: the rendered URL
 * is written into COPY statements as a string literal.
 */

export type StageUrlType = 's3' | 'gcs' | 'azure'

export interface ParsedStageUrl {
  type: StageUrlType
  /** S3/GCS bucket. */
  bucket?: string
  /** Azure storage account and container. */
  account?: string
  container?: string
  /** Normalised key prefix: no leading slash, trailing slash when non-empty. */
  prefix: string
}

/** How a warehouse spells object-store URLs. */
export type UrlDialect = 'snowflake' | 'spark' | 'bigquery'

const BUCKET = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/
const ACCOUNT = /^[a-z0-9]{3,24}$/
const CONTAINER = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/
const SEGMENT = /^[A-Za-z0-9._=-]+$/

function prefixOf(path: string): string {
  const segments = path.split('/').filter((s) => s !== '')
  for (const s of segments) {
    if (s === '..' || s === '.' || !SEGMENT.test(s)) {
      throw new Error(
        'Stage path segments may contain only letters, digits, . _ - and = (no `..`).',
      )
    }
  }
  return segments.length === 0 ? '' : `${segments.join('/')}/`
}

function bucketOf(name: string): string {
  if (!BUCKET.test(name) || name.includes('..')) throw new Error(`Invalid bucket name '${name}'.`)
  return name
}

function azure(account: string, container: string, path: string): ParsedStageUrl {
  if (!ACCOUNT.test(account)) {
    throw new Error('Azure storage account names are 3-24 lowercase letters or digits.')
  }
  if (!CONTAINER.test(container) || container.includes('--')) {
    throw new Error(`Invalid Azure container name '${container}'.`)
  }
  return { type: 'azure', account, container, prefix: prefixOf(path) }
}

/** Parse a staging URL. Throws a caller-safe `Error` when it is not one. */
export function parseStageUrl(url: string): ParsedStageUrl {
  const m = /^([a-z0-9]+):\/\/([^/?#]+)(\/[^?#]*)?$/.exec(url.trim())
  if (!m) throw new Error('Not a storage URL (expected e.g. `s3://bucket/prefix/`).')
  const scheme = m[1]!
  const authority = m[2]!
  const path = m[3] ?? ''
  switch (scheme) {
    case 's3':
    case 's3a':
      return { type: 's3', bucket: bucketOf(authority), prefix: prefixOf(path) }
    case 'gs':
    case 'gcs':
      return { type: 'gcs', bucket: bucketOf(authority), prefix: prefixOf(path) }
    case 'azure': {
      // azure://<account>.blob.core.windows.net/<container>/<path>
      const host = /^([a-z0-9]+)\.blob\.core\.windows\.net$/.exec(authority)
      if (!host)
        throw new Error(
          'Azure URLs look like `azure://<account>.blob.core.windows.net/<container>/…`.',
        )
      const [, container = '', ...rest] = path.split('/')
      return azure(host[1]!, container, rest.join('/'))
    }
    case 'abfss':
    case 'wasbs': {
      // abfss://<container>@<account>.dfs.core.windows.net/<path>
      const host = /^([a-z0-9-]+)@([a-z0-9]+)\.(?:dfs|blob)\.core\.windows\.net$/.exec(authority)
      if (!host) {
        throw new Error(
          'Azure URLs look like `abfss://<container>@<account>.dfs.core.windows.net/…`.',
        )
      }
      return azure(host[2]!, host[1]!, path)
    }
    default:
      throw new Error(`Unsupported storage URL scheme '${scheme}://'.`)
  }
}

/** The location (with its prefix, ending in `/`) as `dialect` spells it. */
export function renderStageUrl(p: ParsedStageUrl, dialect: UrlDialect): string {
  switch (p.type) {
    case 's3':
      return `s3://${p.bucket}/${p.prefix}`
    case 'gcs':
      return `${dialect === 'snowflake' ? 'gcs' : 'gs'}://${p.bucket}/${p.prefix}`
    case 'azure':
      return dialect === 'snowflake'
        ? `azure://${p.account}.blob.core.windows.net/${p.container}/${p.prefix}`
        : `abfss://${p.container}@${p.account}.dfs.core.windows.net/${p.prefix}`
  }
}
