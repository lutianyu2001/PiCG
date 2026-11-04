import { AwsClient } from 'aws4fetch'
import { StorageError, StorageErrorKind } from '../storage/storage'

const TIMEOUT_MS = 60_000
/** ListObjectsV2 returns at most 1000 keys per request; PiCG reads at most this many pages. */
export const MAX_LIST_PAGES = 100

export class R2Error extends StorageError {
  constructor(
    kind: StorageErrorKind,
    status: number,
    message: string,
    /** The S3 error code, such as NoSuchBucket. */
    readonly code = ''
  ) {
    super('r2', kind, status, message)
  }
}

/** Where a bucket is: the account's S3 API endpoint (without a path) and the bucket name. */
export interface BucketRef {
  endpoint: string
  bucket: string
}

export interface R2Keys {
  accessKeyId: string
  secretAccessKey: string
}

export interface R2Object {
  key: string
  size: number
  etag: string
  lastModified: string
}

const ENDPOINT = /^https:\/\/([0-9a-f]{32})(\.(?:eu|fedramp))?\.r2\.cloudflarestorage\.com$/i
const BUCKET = /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/

/**
 * Reads an S3 API address as the bucket's settings page shows it, `https://{account}.r2.cloudflarestorage.com/
 * {bucket}`, possibly with a jurisdiction (`.eu`). Returns null when it is not one.
 */
export function parseS3Address(text: string): BucketRef | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  const endpoint = `${url.protocol}//${url.host}`.toLowerCase()
  const bucket = url.pathname.replace(/^\/+|\/+$/g, '')
  if (!ENDPOINT.test(endpoint) || !BUCKET.test(bucket) || url.search || url.hash) {
    return null
  }
  return { endpoint, bucket }
}

/** The account ID in an endpoint. */
export const accountOf = (endpoint: string) => ENDPOINT.exec(endpoint)?.[1] ?? ''

export const isBucketName = (name: string) => BUCKET.test(name)

/** Percent-encodes each segment of a key the way Signature Version 4 expects it. */
export const encodeKey = (key: string) =>
  key
    .split('/')
    .map((part) =>
      encodeURIComponent(part).replace(
        /[!'()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
      )
    )
    .join('/')

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodeXml(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (all, name: string) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : +name.slice(1)
      return String.fromCodePoint(code)
    }
    return ENTITIES[name] ?? all
  })
}

/** The text of every `<tag>` element, in order. The S3 answers PiCG reads are flat enough for this. */
export function xmlValues(xml: string, tag: string): string[] {
  const out: string[] = []
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g')
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    out.push(decodeXml(m[1]))
  }
  return out
}

const xmlValue = (xml: string, tag: string) => xmlValues(xml, tag)[0] ?? ''

/** The objects and the continuation token of one ListObjectsV2 answer. */
export function parseListing(xml: string) {
  const objects: R2Object[] = xmlValues(xml, 'Contents').map((part) => ({
    key: xmlValue(part, 'Key'),
    size: Number(xmlValue(part, 'Size')) || 0,
    etag: xmlValue(part, 'ETag').replace(/"/g, ''),
    lastModified: xmlValue(part, 'LastModified')
  }))
  const more = xmlValue(xml, 'IsTruncated') === 'true'
  return { objects, next: more ? xmlValue(xml, 'NextContinuationToken') : '' }
}

export function classify(status: number, code: string): StorageErrorKind {
  switch (code) {
    case 'InvalidAccessKeyId':
    case 'SignatureDoesNotMatch':
    case 'InvalidToken':
    case 'ExpiredToken':
      return 'unauthorized'
    case 'AccessDenied':
      return 'forbidden'
    case 'NoSuchBucket':
    case 'NoSuchKey':
      return 'not_found'
    case 'PreconditionFailed':
      return 'conflict'
    case 'EntityTooLarge':
      return 'too_large'
    case 'SlowDown':
      return 'rate_limit'
  }
  if (status === 401) {
    return 'unauthorized'
  }
  if (status === 403) {
    return 'forbidden'
  }
  if (status === 404) {
    return 'not_found'
  }
  if (status === 409 || status === 412) {
    return 'conflict'
  }
  if (status === 413) {
    return 'too_large'
  }
  if (status === 429) {
    return 'rate_limit'
  }
  if (status === 400) {
    return 'validation'
  }
  return status >= 500 ? 'server' : 'unknown'
}

interface SendOptions {
  method?: string
  key?: string
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: BodyInit
}

/** Requests to one R2 bucket through its S3-compatible API, signed with Signature Version 4. */
export class R2Client {
  private readonly aws: AwsClient

  constructor(
    readonly ref: BucketRef,
    keys: R2Keys
  ) {
    this.aws = new AwsClient({ ...keys, service: 's3', region: 'auto' })
  }

  /** Sends a request. Every failure is thrown as an R2Error; a request the browser blocks is `blocked`. */
  async send(options: SendOptions = {}): Promise<Response> {
    const path = options.key === undefined ? '' : `/${encodeKey(options.key)}`
    const url = new URL(`${this.ref.endpoint}/${encodeURIComponent(this.ref.bucket)}${path}`)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      url.searchParams.set(key, value)
    }
    let res: Response
    try {
      res = await this.aws.fetch(url.toString(), {
        method: options.method ?? 'GET',
        headers: options.headers,
        body: options.body,
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS)
      })
    } catch (err) {
      // fetch says nothing about why it failed. Offline is a network error; online, the usual cause is a CORS
      // policy that does not let this site in.
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false
      const timeout = (err as Error).name === 'TimeoutError'
      throw new R2Error(offline || timeout ? 'network' : 'blocked', 0, (err as Error).message)
    }
    if (!res.ok) {
      const text = options.method === 'HEAD' ? '' : await res.text().catch(() => '')
      const code = xmlValue(text, 'Code')
      throw new R2Error(
        classify(res.status, code),
        res.status,
        xmlValue(text, 'Message') || res.statusText,
        code
      )
    }
    return res
  }

  /** Every object in the bucket, page by page. `truncated` is set when there were more than PiCG reads. */
  async list() {
    const objects: R2Object[] = []
    let token = ''
    for (let page = 0; page < MAX_LIST_PAGES; page++) {
      const query: Record<string, string> = { 'list-type': '2', 'max-keys': '1000' }
      if (token) {
        query['continuation-token'] = token
      }
      const res = await this.send({ query })
      const part = parseListing(await res.text())
      objects.push(...part.objects)
      token = part.next
      if (!token) {
        return { objects, truncated: false }
      }
    }
    return { objects, truncated: true }
  }

  /** At most one key, to see whether the keys can read the bucket. */
  async probe() {
    await this.send({ query: { 'list-type': '2', 'max-keys': '1' } })
  }

  async head(key: string) {
    try {
      const res = await this.send({ method: 'HEAD', key })
      return {
        size: Number(res.headers.get('content-length')) || 0,
        etag: (res.headers.get('etag') ?? '').replace(/"/g, ''),
        lastModified: res.headers.get('last-modified') ?? ''
      }
    } catch (err) {
      if (err instanceof R2Error && err.kind === 'not_found') {
        return null
      }
      throw err
    }
  }

  async getText(key: string) {
    try {
      const res = await this.send({ key })
      return {
        etag: (res.headers.get('etag') ?? '').replace(/"/g, ''),
        text: await res.text()
      }
    } catch (err) {
      if (err instanceof R2Error && err.kind === 'not_found') {
        return null
      }
      throw err
    }
  }

  /**
   * Stores an object. `ifMatch` replaces only that version; `ifNoneMatch` stores only when the key is free. A
   * failed condition is a `conflict`. Returns the new ETag.
   */
  async put(
    key: string,
    body: Blob | string,
    options: { contentType: string; ifMatch?: string; ifNoneMatch?: boolean }
  ) {
    const headers: Record<string, string> = { 'content-type': options.contentType }
    if (options.ifMatch) {
      headers['if-match'] = `"${options.ifMatch}"`
    } else if (options.ifNoneMatch) {
      headers['if-none-match'] = '*'
    }
    const res = await this.send({ method: 'PUT', key, headers, body })
    return (res.headers.get('etag') ?? '').replace(/"/g, '')
  }

  /** Copies an object within the bucket. */
  async copy(from: string, to: string) {
    const res = await this.send({
      method: 'PUT',
      key: to,
      headers: { 'x-amz-copy-source': `/${encodeURIComponent(this.ref.bucket)}/${encodeKey(from)}` }
    })
    // S3 can answer 200 to a copy and still report an error in the body.
    const text = await res.text()
    const code = xmlValue(text, 'Code')
    if (/<Error>/.test(text)) {
      throw new R2Error(classify(500, code), res.status, xmlValue(text, 'Message'), code)
    }
  }

  async delete(key: string) {
    await this.send({ method: 'DELETE', key })
  }
}
