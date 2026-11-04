import { describe, expect, it } from 'vitest'
import { accountOf, classify, encodeKey, parseListing, parseS3Address } from './r2.client'
import { corsPolicy, normalizePublicUrl } from '../session/r2-check'

const ACCOUNT = '0123456789abcdef0123456789abcdef'

describe('parseS3Address', () => {
  it('reads the endpoint and the bucket', () => {
    expect(parseS3Address(`https://${ACCOUNT}.r2.cloudflarestorage.com/my-images`)).toEqual({
      endpoint: `https://${ACCOUNT}.r2.cloudflarestorage.com`,
      bucket: 'my-images'
    })
  })

  it('keeps a jurisdiction and ignores a trailing slash and spaces', () => {
    expect(parseS3Address(` https://${ACCOUNT}.eu.r2.cloudflarestorage.com/pics/ `)).toEqual({
      endpoint: `https://${ACCOUNT}.eu.r2.cloudflarestorage.com`,
      bucket: 'pics'
    })
  })

  it('refuses addresses that are not an R2 bucket', () => {
    expect(parseS3Address(`https://${ACCOUNT}.r2.cloudflarestorage.com`)).toBeNull()
    expect(parseS3Address(`https://${ACCOUNT}.r2.cloudflarestorage.com/a/b`)).toBeNull()
    expect(parseS3Address(`http://${ACCOUNT}.r2.cloudflarestorage.com/pics`)).toBeNull()
    expect(parseS3Address('https://example.com/pics')).toBeNull()
    expect(parseS3Address('pics')).toBeNull()
  })

  it('gives the account of an endpoint', () => {
    expect(accountOf(`https://${ACCOUNT}.eu.r2.cloudflarestorage.com`)).toBe(ACCOUNT)
  })
})

describe('encodeKey', () => {
  it('encodes each segment as Signature Version 4 expects', () => {
    expect(encodeKey("2026/11/a b+c(1)!'*.png")).toBe('2026/11/a%20b%2Bc%281%29%21%27%2A.png')
    expect(encodeKey('图片/猫.webp')).toBe('%E5%9B%BE%E7%89%87/%E7%8C%AB.webp')
  })
})

describe('parseListing', () => {
  it('reads objects, decoding entities, and the continuation token', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
  <Name>pics</Name>
  <IsTruncated>true</IsTruncated>
  <Contents><Key>a&amp;b.png</Key><Size>12</Size><ETag>"abc"</ETag>
    <LastModified>2026-11-04T10:00:00.000Z</LastModified></Contents>
  <Contents><Key>dir/</Key><Size>0</Size><ETag>"d41d"</ETag>
    <LastModified>2026-11-04T10:00:00.000Z</LastModified></Contents>
  <NextContinuationToken>next&#x2F;1</NextContinuationToken>
</ListBucketResult>`
    expect(parseListing(xml)).toEqual({
      objects: [
        { key: 'a&b.png', size: 12, etag: 'abc', lastModified: '2026-11-04T10:00:00.000Z' },
        { key: 'dir/', size: 0, etag: 'd41d', lastModified: '2026-11-04T10:00:00.000Z' }
      ],
      next: 'next/1'
    })
  })

  it('has no token on the last page', () => {
    expect(parseListing('<IsTruncated>false</IsTruncated>').next).toBe('')
  })
})

describe('classify', () => {
  it('maps S3 error codes before statuses', () => {
    expect(classify(403, 'SignatureDoesNotMatch')).toBe('unauthorized')
    expect(classify(403, 'InvalidAccessKeyId')).toBe('unauthorized')
    expect(classify(403, 'AccessDenied')).toBe('forbidden')
    expect(classify(404, 'NoSuchBucket')).toBe('not_found')
    expect(classify(412, '')).toBe('conflict')
    expect(classify(503, '')).toBe('server')
  })
})

describe('corsPolicy', () => {
  it('is valid JSON with each list on one line', () => {
    const text = corsPolicy('https://picg.lu.fm')
    expect(JSON.parse(text)[0].AllowedOrigins).toEqual(['https://picg.lu.fm'])
    expect(text).toContain('"AllowedMethods": ["GET", "PUT", "DELETE", "HEAD"]')
    expect(text.split('\n')).toHaveLength(9)
  })
})

describe('normalizePublicUrl', () => {
  it('needs https and drops the trailing slash', () => {
    expect(normalizePublicUrl(' https://img.example.com/ ')).toBe('https://img.example.com')
    expect(normalizePublicUrl('https://pub-1.r2.dev/sub/')).toBe('https://pub-1.r2.dev/sub')
    expect(normalizePublicUrl('http://img.example.com')).toBeNull()
    expect(normalizePublicUrl('https://img.example.com/?a=1')).toBeNull()
  })
})
