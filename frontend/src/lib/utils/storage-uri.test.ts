import { describe, it, expect } from 'vitest'
import {
  buildModelPackUri,
  buildPvcUri,
  hasNoDownloader,
  modelPackReference,
  needsNodePath,
  parseModelPackUri,
  parsePvcUri,
  storageUriIssue,
  storageUriScheme,
} from './storage-uri'

describe('pvc:// URIs', () => {
  it('round-trips the BaseModel form pvc://{pvc-name}/{sub-path}', () => {
    const parts = { pvcName: 'model-storage', subPath: 'models/llama-3-2-1b-instruct' }
    const uri = buildPvcUri(parts)
    expect(uri).toBe('pvc://model-storage/models/llama-3-2-1b-instruct')
    expect(parsePvcUri(uri)).toEqual({ ok: true, value: parts })
  })

  it('round-trips the ClusterBaseModel form pvc://{namespace}:{pvc-name}/{sub-path}', () => {
    const parts = { namespace: 'llama-demo', pvcName: 'model-storage', subPath: 'llama' }
    const uri = buildPvcUri(parts)
    expect(uri).toBe('pvc://llama-demo:model-storage/llama')
    expect(parsePvcUri(uri)).toEqual({ ok: true, value: parts })
  })

  it('builds nothing until the claim and the sub-path are known', () => {
    expect(buildPvcUri({ pvcName: '', subPath: 'x' })).toBe('')
    expect(buildPvcUri({ pvcName: 'pvc', subPath: '' })).toBe('')
    expect(buildPvcUri({ namespace: '', pvcName: 'pvc', subPath: 'x' })).toBe('pvc://pvc/x')
  })

  it('rejects what ParsePVCStorageURI rejects', () => {
    const errors = [
      's3://bucket/x',
      'pvc://',
      'pvc://model-storage',
      'pvc://model-storage/',
      'pvc:///sub',
      'pvc://:pvc/sub',
      'pvc://ns:/sub',
      'pvc://ns:pvc:extra/sub',
      'pvc://Bad_NS:pvc/sub',
      'pvc://pvc/a/../b',
    ].map((uri) => parsePvcUri(uri))
    for (const result of errors) expect(result.ok).toBe(false)
  })
})

describe('modelpack:// URIs', () => {
  it('round-trips a tagged reference', () => {
    const parts = { registry: 'ghcr.io', repository: 'org/model', tag: 'tag' }
    const uri = buildModelPackUri(parts)
    expect(uri).toBe('modelpack://ghcr.io/org/model:tag')
    expect(parseModelPackUri(uri)).toEqual({ ok: true, value: parts })
  })

  it('round-trips a digest reference with a registry port and a deep repository', () => {
    const parts = {
      registry: 'registry.example.com:5000',
      repository: 'a/b/c',
      digest: 'sha256:abc',
    }
    const uri = buildModelPackUri(parts)
    expect(uri).toBe('modelpack://registry.example.com:5000/a/b/c@sha256:abc')
    expect(parseModelPackUri(uri)).toEqual({ ok: true, value: parts })
  })

  it('accepts a bare repository and a tag pinned by a digest', () => {
    expect(parseModelPackUri('modelpack://ghcr.io/org/model')).toEqual({
      ok: true,
      value: { registry: 'ghcr.io', repository: 'org/model' },
    })
    expect(parseModelPackUri('modelpack://ghcr.io/org/model:v1@sha256:abc')).toEqual({
      ok: true,
      value: { registry: 'ghcr.io', repository: 'org/model', tag: 'v1', digest: 'sha256:abc' },
    })
  })

  it('reads one "tag or digest" field', () => {
    expect(modelPackReference('')).toEqual({})
    expect(modelPackReference(' v1 ')).toEqual({ tag: 'v1' })
    expect(modelPackReference('sha256:abc')).toEqual({ digest: 'sha256:abc' })
    expect(
      buildModelPackUri({ registry: 'ghcr.io', repository: 'org/m', ...modelPackReference('v1') })
    ).toBe('modelpack://ghcr.io/org/m:v1')
    expect(buildModelPackUri({ registry: '', repository: 'org/m' })).toBe('')
  })

  it('rejects what ParseModelPackStorageURI rejects, plus malformed tags and digests', () => {
    const errors = [
      'oci://n/x/b/y/o/z',
      'modelpack://',
      'modelpack://   ',
      'modelpack://model',
      'modelpack://ghcr.io/',
      'modelpack:///model',
      'modelpack://ghcr.io/org/model:',
      'modelpack://ghcr.io/org/model@',
      'modelpack://ghcr.io/org/model:bad tag',
      'modelpack://ghcr.io/org/model@notadigest',
    ].map((uri) => parseModelPackUri(uri))
    for (const result of errors) expect(result.ok).toBe(false)
  })
})

describe('storage URI rules by kind', () => {
  it('requires the namespace form for a ClusterBaseModel and forbids it for a BaseModel', () => {
    expect(storageUriIssue('pvc://ns:pvc/sub', true)).toBeNull()
    expect(storageUriIssue('pvc://pvc/sub', true)).toMatch(/must name the claim's namespace/)
    expect(storageUriIssue('pvc://pvc/sub', false)).toBeNull()
    expect(storageUriIssue('pvc://ns:pvc/sub', false)).toMatch(/must not name a namespace/)
    expect(storageUriIssue('pvc://pvc', false)).toMatch(/missing sub-path/)
  })

  it('checks the modelpack shape and leaves the other schemes alone', () => {
    expect(storageUriIssue('modelpack://ghcr.io/org/model:v1', true)).toBeNull()
    expect(storageUriIssue('modelpack://model', true)).toMatch(/Invalid ModelPack storage URI/)
    expect(storageUriIssue('hf://meta-llama/Llama-3.2-1B', false)).toBeNull()
    expect(storageUriIssue('', false)).toBeNull()
  })

  it('knows which schemes download to a node path and which have no downloader', () => {
    expect(storageUriScheme('pvc://pvc/sub')).toBe('pvc')
    expect(storageUriScheme('nonsense')).toBe('')
    for (const scheme of ['hf', 'oci', 'modelpack', 'local'])
      expect(needsNodePath(scheme)).toBe(true)
    for (const scheme of ['pvc', 'vendor', 's3']) expect(needsNodePath(scheme)).toBe(false)
    for (const uri of ['s3://b/k', 'az://a/c/p', 'gs://b/o', 'github://o/r']) {
      expect(hasNoDownloader(uri)).toBe(true)
    }
    expect(hasNoDownloader('hf://org/repo')).toBe(false)
  })
})
