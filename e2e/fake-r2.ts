import { createHash } from 'node:crypto'
import type { Page, Route } from '@playwright/test'
import { AwsV4Signer } from 'aws4fetch'

/**
 * An in-memory stand-in for the parts of the S3-compatible API of Cloudflare R2 that PiCG uses. Every request must
 * carry a valid Signature Version 4 for the account's keys, checked by signing it again.
 */
export const ACCOUNT = '0123456789abcdef0123456789abcdef'
export const ENDPOINT = `https://${ACCOUNT}.r2.cloudflarestorage.com`
export const KEYS = { accessKeyId: 'AKIDTEST0001', secretAccessKey: 'secret-for-tests-only' }

interface R2Object {
  body: Buffer
  etag: string
  contentType: string
  lastModified: string
}

export interface FakeBucket {
  name: string
  objects: Map<string, R2Object>
  /** The keys can only read here (403 to writes). */
  readOnly: boolean
  /** No CORS policy lets the page in: the browser blocks every request. */
  noCors: boolean
  /** Host of the public address, such as `img.test`. */
  publicHost: string
}

const md5 = (body: Buffer) => createHash('md5').update(body).digest('hex')

const escapeXml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => `&${{ '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": 'apos' }[c]};`
  )

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'ETag'
}

export class FakeR2 {
  readonly buckets = new Map<string, FakeBucket>()
  /** Requests seen, as `METHOD /bucket/key`, for assertions. */
  readonly log: string[] = []
  /** Headers of each PUT, by key, for assertions. */
  readonly puts = new Map<string, Record<string, string>>()

  addBucket(
    name: string,
    files: Record<string, string | Buffer> = {},
    options: Partial<FakeBucket> = {}
  ) {
    const bucket: FakeBucket = {
      name,
      objects: new Map(),
      readOnly: false,
      noCors: false,
      publicHost: `${name}.img.test`,
      ...options
    }
    for (const [key, content] of Object.entries(files)) {
      this.store(bucket, key, Buffer.from(content), 'application/octet-stream')
    }
    this.buckets.set(name, bucket)
    return bucket
  }

  private store(bucket: FakeBucket, key: string, body: Buffer, contentType: string) {
    const object = { body, etag: md5(body), contentType, lastModified: new Date().toUTCString() }
    bucket.objects.set(key, object)
    return object
  }

  async install(page: Page) {
    await page.route(/^https:\/\/[0-9a-f]{32}(\.eu)?\.r2\.cloudflarestorage\.com\//, (route) =>
      this.handle(route)
    )
    await page.route(/^https:\/\/[^/]+\.img\.test\//, (route) => this.serve(route))
  }

  /** The public address: objects as they are, without signatures. */
  private async serve(route: Route) {
    const url = new URL(route.request().url())
    const bucket = [...this.buckets.values()].find((b) => b.publicHost === url.host)
    const key = url.pathname.slice(1).split('/').map(decodeURIComponent).join('/')
    const object = bucket?.objects.get(key)
    if (!object) {
      return route.fulfill({ status: 404, body: 'Not Found' })
    }
    return route.fulfill({ status: 200, body: object.body, contentType: object.contentType })
  }

  private error(route: Route, status: number, code: string, message = code) {
    return route.fulfill({
      status,
      headers: { ...CORS, 'content-type': 'application/xml' },
      body: `<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`
    })
  }

  /** Signs the request again with the right keys and compares the signatures. */
  private async signatureProblem(route: Route): Promise<string | null> {
    const req = route.request()
    const headers = await req.allHeaders()
    const auth = headers['authorization'] ?? ''
    const match = /Credential=([^/]+)\/[^,]+, ?SignedHeaders=([^,]+), ?Signature=(\w+)/.exec(auth)
    if (!match) {
      return 'AccessDenied'
    }
    if (match[1] !== KEYS.accessKeyId) {
      return 'InvalidAccessKeyId'
    }
    const signed: Record<string, string> = {}
    for (const name of match[2].split(';')) {
      if (name !== 'host') {
        signed[name] = headers[name] ?? ''
      }
    }
    const again = await new AwsV4Signer({
      method: req.method(),
      url: req.url(),
      headers: signed,
      ...KEYS,
      service: 's3',
      region: 'auto',
      datetime: headers['x-amz-date']
    }).sign()
    const expected = /Signature=(\w+)/.exec(again.headers.get('authorization') ?? '')?.[1]
    return expected === match[3] ? null : 'SignatureDoesNotMatch'
  }

  private async handle(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const [bucketName, ...rest] = url.pathname.slice(1).split('/').map(decodeURIComponent)
    const key = rest.join('/')
    const bucket = this.buckets.get(bucketName)
    if (bucket?.noCors) {
      return route.abort('failed')
    }
    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 200,
        headers: {
          ...CORS,
          'access-control-allow-methods': 'GET, PUT, DELETE, HEAD',
          'access-control-allow-headers':
            'authorization, content-type, x-amz-content-sha256, x-amz-date, x-amz-copy-source, if-match, if-none-match'
        }
      })
    }
    this.log.push(`${req.method()} /${bucketName}${key ? '/' + key : ''}`)
    const problem = await this.signatureProblem(route)
    if (problem) {
      return this.error(route, 403, problem)
    }
    if (!bucket) {
      return this.error(route, 404, 'NoSuchBucket')
    }
    const headers = await req.allHeaders()
    const method = req.method()

    if (!key && method === 'GET') {
      return this.list(route, bucket, url)
    }
    const object = bucket.objects.get(key)
    if (method === 'GET' || method === 'HEAD') {
      if (!object) {
        return this.error(route, 404, 'NoSuchKey')
      }
      return route.fulfill({
        status: 200,
        headers: {
          ...CORS,
          etag: `"${object.etag}"`,
          'content-type': object.contentType,
          'last-modified': object.lastModified
        },
        body: method === 'HEAD' ? undefined : object.body
      })
    }
    if (bucket.readOnly && (method === 'PUT' || method === 'DELETE')) {
      return this.error(route, 403, 'AccessDenied')
    }
    if (method === 'PUT') {
      this.puts.set(key, headers)
      const source = headers['x-amz-copy-source']
      if (source) {
        const [, , ...from] = source.split('/').map(decodeURIComponent)
        const original = bucket.objects.get(from.join('/'))
        if (!original) {
          return this.error(route, 404, 'NoSuchKey')
        }
        const copy = this.store(bucket, key, original.body, original.contentType)
        return route.fulfill({
          status: 200,
          headers: { ...CORS, 'content-type': 'application/xml' },
          body: `<CopyObjectResult><ETag>"${copy.etag}"</ETag></CopyObjectResult>`
        })
      }
      const ifNoneMatch = headers['if-none-match']
      const ifMatch = headers['if-match']?.replace(/"/g, '')
      if ((ifNoneMatch === '*' && object) || (ifMatch && ifMatch !== object?.etag)) {
        return this.error(route, 412, 'PreconditionFailed')
      }
      const stored = this.store(
        bucket,
        key,
        req.postDataBuffer() ?? Buffer.alloc(0),
        headers['content-type'] ?? 'application/octet-stream'
      )
      return route.fulfill({ status: 200, headers: { ...CORS, etag: `"${stored.etag}"` } })
    }
    if (method === 'DELETE') {
      bucket.objects.delete(key)
      return route.fulfill({ status: 204, headers: CORS })
    }
    return this.error(route, 501, 'NotImplemented')
  }

  /** ListObjectsV2, with the continuation token being the index to go on from. */
  private list(route: Route, bucket: FakeBucket, url: URL) {
    const max = Number(url.searchParams.get('max-keys') ?? 1000)
    const start = Number(url.searchParams.get('continuation-token') ?? 0)
    const keys = [...bucket.objects.keys()].sort()
    const page = keys.slice(start, start + max)
    const more = start + max < keys.length
    const contents = page
      .map((key) => {
        const o = bucket.objects.get(key)!
        return `<Contents><Key>${escapeXml(key)}</Key><Size>${o.body.length}</Size><ETag>"${o.etag}"</ETag><LastModified>${new Date(o.lastModified).toISOString()}</LastModified></Contents>`
      })
      .join('')
    return route.fulfill({
      status: 200,
      headers: { ...CORS, 'content-type': 'application/xml' },
      body: `<?xml version="1.0" encoding="UTF-8"?><ListBucketResult><Name>${bucket.name}</Name><IsTruncated>${more}</IsTruncated><KeyCount>${page.length}</KeyCount>${contents}${more ? `<NextContinuationToken>${start + max}</NextContinuationToken>` : ''}</ListBucketResult>`
    })
  }
}
