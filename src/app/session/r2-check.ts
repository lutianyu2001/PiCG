import { Injectable } from '@angular/core'
import { BucketRef, R2Client, R2Error, R2Keys } from '../r2/r2.client'
import { R2Bucket } from './session.store'

export type R2CheckFailure =
  | 'address'
  | 'public_url'
  | 'blocked'
  | 'network'
  | 'invalid'
  | 'bucket_missing'
  | 'no_read'
  | 'no_write'
  | 'unexpected'

export type R2CheckResult =
  { ok: true } | { ok: false; reason: R2CheckFailure; bucket?: string; status?: number }

/** Written and deleted again to see whether the keys can write. */
export const CHECK_KEY = '.picg/check'

/**
 * Reads a public address: `https://`, no query or fragment. Returns it without a trailing slash, or null when it is
 * not one.
 */
export function normalizePublicUrl(text: string): string | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) {
    return null
  }
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '')
}

/**
 * The CORS policy to paste into the bucket's settings, letting this origin in with the requests PiCG sends. Each
 * list is on one line, so the policy stays short on the page.
 */
export function corsPolicy(origin: string) {
  return JSON.stringify(
    [
      {
        AllowedOrigins: [origin],
        AllowedMethods: ['GET', 'PUT', 'DELETE', 'HEAD'],
        AllowedHeaders: [
          'authorization',
          'content-type',
          'x-amz-content-sha256',
          'x-amz-date',
          'x-amz-copy-source',
          'if-match',
          'if-none-match'
        ],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600
      }
    ],
    null,
    2
  ).replace(
    /\[\n\s+([^[\]]*?)\n\s+\]/g,
    (_, items: string) => `[${items.split(/,\n\s+/).join(', ')}]`
  )
}

function failure(err: unknown, write: boolean, bucket: string): R2CheckResult {
  if (!(err instanceof R2Error)) {
    return { ok: false, reason: 'unexpected', bucket }
  }
  switch (err.kind) {
    case 'blocked':
      return { ok: false, reason: 'blocked', bucket }
    case 'network':
      return { ok: false, reason: 'network', bucket }
    case 'unauthorized':
      return { ok: false, reason: 'invalid', bucket }
    case 'not_found':
      return { ok: false, reason: 'bucket_missing', bucket }
    case 'forbidden':
      return { ok: false, reason: write ? 'no_write' : 'no_read', bucket }
  }
  return { ok: false, reason: 'unexpected', bucket, status: err.status }
}

/** Checks R2 keys against buckets: each must be readable and writable with them. */
@Injectable({ providedIn: 'root' })
export class R2Check {
  async check(endpoint: string, keys: R2Keys, buckets: R2Bucket[]): Promise<R2CheckResult> {
    for (const bucket of buckets) {
      const ref: BucketRef = { endpoint, bucket: bucket.name }
      const client = new R2Client(ref, keys)
      try {
        await client.probe()
      } catch (err) {
        return failure(err, false, bucket.name)
      }
      try {
        await client.put(CHECK_KEY, 'PiCG checks that it can write here.\n', {
          contentType: 'text/plain; charset=utf-8'
        })
        await client.delete(CHECK_KEY)
      } catch (err) {
        return failure(err, true, bucket.name)
      }
    }
    return { ok: true }
  }
}
