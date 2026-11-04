import { createHash } from 'node:crypto'
import type { Page, Route } from '@playwright/test'

/**
 * An in-memory stand-in for the parts of the GitHub REST API that PiCG uses, so the end-to-end tests run without a
 * token or a real repository. Each commit stores the full map of paths to blob ids; trees are made from it.
 */
export interface FakeRepo {
  name: string
  defaultBranch: string
  hasPages: boolean
  /** The token cannot write here (403 to writes). */
  readOnly: boolean
  /** GitHub has blocked the repository (451 to everything but the listing). */
  blocked: boolean
  branches: Map<string, string>
}

interface Commit {
  sha: string
  files: Map<string, string>
  parents: string[]
  date: string
}

const sha = (text: string | Buffer) => createHash('sha1').update(text).digest('hex')

export class FakeGitHub {
  readonly login = 'tester'
  readonly blobs = new Map<string, Buffer>()
  readonly commits = new Map<string, Commit>()
  readonly trees = new Map<string, Map<string, string>>()
  readonly repos = new Map<string, FakeRepo>()
  /** Requests seen, as `METHOD path`, for assertions. */
  readonly log: string[] = []

  addRepo(
    name: string,
    files: Record<string, string | Buffer> = {},
    options: Partial<FakeRepo> = {}
  ) {
    const repo: FakeRepo = {
      name,
      defaultBranch: 'main',
      hasPages: false,
      readOnly: false,
      blocked: false,
      branches: new Map(),
      ...options
    }
    this.repos.set(name, repo)
    if (Object.keys(files).length) {
      const map = new Map<string, string>()
      for (const [path, content] of Object.entries(files)) {
        map.set(path, this.putBlob(Buffer.from(content)))
      }
      repo.branches.set(repo.defaultBranch, this.makeCommit(map, []))
    }
    return repo
  }

  putBlob(content: Buffer) {
    const id = sha(Buffer.concat([Buffer.from(`blob ${content.length}\0`), content]))
    this.blobs.set(id, content)
    return id
  }

  makeCommit(files: Map<string, string>, parents: string[]) {
    const id = sha(`${Date.now()} ${Math.random()} ${parents.join()}`)
    this.commits.set(id, {
      sha: id,
      files: new Map(files),
      parents,
      date: new Date().toISOString()
    })
    return id
  }

  /** Renames a branch as GitHub does, moving the default branch with it. */
  renameBranch(repo: string, from: string, to: string) {
    const r = this.repos.get(repo)!
    r.branches.set(to, r.branches.get(from)!)
    r.branches.delete(from)
    if (r.defaultBranch === from) {
      r.defaultBranch = to
    }
  }

  /** Files on a branch, as text. */
  files(repo: string, branch?: string): Record<string, string> {
    const r = this.repos.get(repo)!
    const head = r.branches.get(branch ?? r.defaultBranch)
    const out: Record<string, string> = {}
    for (const [path, blob] of this.commits.get(head!)?.files ?? []) {
      out[path] = this.blobs.get(blob)!.toString('latin1')
    }
    return out
  }

  bytes(repo: string, path: string, branch?: string) {
    const r = this.repos.get(repo)!
    const head = r.branches.get(branch ?? r.defaultBranch)!
    return this.blobs.get(this.commits.get(head)!.files.get(path)!)!
  }

  /** Routes every GitHub API and raw file request of the page to this fake. */
  async install(page: Page) {
    await page.route('https://api.github.com/**', (route) => this.handle(route))
    await page.route('https://github.com/*/*/raw/**', (route) => this.raw(route))
    // Keep the tests off the network: without the font CDNs the page uses system fonts.
    await page.route(/^https:\/\/(cdn\.jsdelivr\.net|registry\.npmmirror\.com)\//, (route) =>
      route.abort()
    )
  }

  private async raw(route: Route) {
    const parts = new URL(route.request().url()).pathname.split('/').map(decodeURIComponent)
    const [, , repo, , branch, ...rest] = parts
    const r = this.repos.get(repo)
    const head = r?.branches.get(branch)
    const blob = head ? this.commits.get(head)?.files.get(rest.join('/')) : undefined
    if (!blob) {
      return route.fulfill({ status: 404, body: 'Not Found' })
    }
    return route.fulfill({
      status: 200,
      body: this.blobs.get(blob)!,
      headers: { 'access-control-allow-origin': '*' }
    })
  }

  private async handle(route: Route) {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.split('/').map(decodeURIComponent).join('/')
    const method = req.method()
    this.log.push(`${method} ${path}`)
    const cors = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*'
    }
    if (method === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: cors })
    }
    const json = (status: number, body: unknown) =>
      route.fulfill({
        status,
        headers: { ...cors, 'content-type': 'application/json' },
        body: JSON.stringify(body)
      })
    const body = req.postData() ? JSON.parse(req.postData()!) : {}
    try {
      const headers = await req.allHeaders()
      const result = this.dispatch(
        method,
        path,
        url.searchParams,
        body,
        headers['authorization'] ?? ''
      )
      return json(result[0], result[1])
    } catch (err) {
      return json(500, { message: (err as Error).message })
    }
  }

  private dispatch(
    method: string,
    path: string,
    query: URLSearchParams,
    body: Record<string, unknown>,
    auth: string
  ): [number, unknown] {
    if (!auth.startsWith('Bearer github_pat_')) {
      return [401, { message: 'Bad credentials' }]
    }
    if (method === 'GET' && path === '/user') {
      return [200, { login: this.login, id: 1, name: 'Tester', avatar_url: '' }]
    }
    if (method === 'GET' && path === '/user/repos') {
      return [
        200,
        query.get('page') === '1'
          ? [...this.repos.keys()].map((n) => ({
              full_name: `${this.login}/${n}`,
              permissions: { push: true }
            }))
          : []
      ]
    }
    const m = path.match(/^\/repos\/([^/]+)\/([^/]+)(\/.*)?$/)
    const repo = m && m[1] === this.login ? this.repos.get(m[2]) : undefined
    if (!m || !repo) {
      return [404, { message: 'Not Found' }]
    }
    const rest = m[3] ?? ''
    if (repo.blocked) {
      return [451, { message: 'Repository access blocked' }]
    }
    if (repo.readOnly && method !== 'GET') {
      return [403, { message: 'Resource not accessible by personal access token' }]
    }
    const head = (branch: string) => repo.branches.get(branch)
    const ref = query.get('ref') || query.get('sha') || repo.defaultBranch

    if (method === 'GET' && rest === '') {
      return [
        200,
        {
          name: repo.name,
          full_name: `${this.login}/${repo.name}`,
          default_branch: repo.defaultBranch,
          has_pages: repo.hasPages,
          private: false,
          archived: false
        }
      ]
    }
    if (method === 'GET' && rest === '/branches') {
      return [200, [...repo.branches.keys()].map((name) => ({ name }))]
    }
    let b = rest.match(/^\/branches\/(.+)$/)
    if (method === 'GET' && b) {
      const commit = head(b[1])
      if (!commit) {
        return [404, { message: 'Branch not found' }]
      }
      return [
        200,
        { name: b[1], commit: { sha: commit, commit: { tree: { sha: `tree-${commit}` } } } }
      ]
    }
    if (method === 'POST' && rest === '/git/blobs') {
      if (!repo.branches.size) {
        return [409, { message: 'Git Repository is empty.' }]
      }
      const content = String(body['content'] ?? '')
      return [
        201,
        {
          sha: this.putBlob(Buffer.from(content, body['encoding'] === 'base64' ? 'base64' : 'utf8'))
        }
      ]
    }
    b = rest.match(/^\/git\/blobs\/(\w+)$/)
    if (method === 'GET' && b) {
      return [200, { content: this.blobs.get(b[1])?.toString('base64') ?? '' }]
    }
    b = rest.match(/^\/git\/trees\/(.+)$/)
    if (method === 'GET' && b) {
      const commit = this.commits.get(head(b[1]) ?? '')
      if (!commit) {
        return [404, { message: 'Not Found' }]
      }
      const dirs = new Set<string>()
      const tree: unknown[] = []
      for (const [p, blob] of commit.files) {
        const parts = p.split('/')
        for (let i = 1; i < parts.length; i++) {
          dirs.add(parts.slice(0, i).join('/'))
        }
        tree.push({ path: p, type: 'blob', sha: blob, size: this.blobs.get(blob)!.length })
      }
      dirs.forEach((d) => tree.push({ path: d, type: 'tree', sha: sha(d) }))
      return [200, { sha: `tree-${commit.sha}`, tree, truncated: false }]
    }
    if (method === 'POST' && rest === '/git/trees') {
      const base = String(body['base_tree'] ?? '').replace(/^tree-/, '')
      const files = new Map(this.commits.get(base)?.files ?? [])
      for (const entry of body['tree'] as {
        path: string
        sha?: string | null
        content?: string
      }[]) {
        if (entry.content !== undefined) {
          files.set(entry.path, this.putBlob(Buffer.from(entry.content)))
        } else if (entry.sha === null) {
          files.delete(entry.path)
        } else {
          files.set(entry.path, entry.sha!)
        }
      }
      const id = sha(`${Math.random()}`)
      this.trees.set(id, files)
      return [201, { sha: id }]
    }
    if (method === 'POST' && rest === '/git/commits') {
      const files = this.trees.get(String(body['tree']))
      if (!files) {
        return [422, { message: 'Tree not found' }]
      }
      return [201, { sha: this.makeCommit(files, body['parents'] as string[]) }]
    }
    if (method === 'POST' && rest === '/git/refs') {
      const name = String(body['ref']).replace(/^refs\/heads\//, '')
      if (repo.branches.has(name)) {
        return [422, { message: 'Reference already exists' }]
      }
      repo.branches.set(name, String(body['sha']))
      return [201, { ref: body['ref'] }]
    }
    b = rest.match(/^\/git\/refs\/heads\/(.+)$/)
    if (method === 'PATCH' && b) {
      const commit = this.commits.get(String(body['sha']))
      if (!commit || (head(b[1]) && !commit.parents.includes(head(b[1])!))) {
        return [422, { message: 'Update is not a fast forward' }]
      }
      repo.branches.set(b[1], commit.sha)
      return [200, { ref: `refs/heads/${b[1]}` }]
    }
    if (method === 'GET' && rest === '/commits') {
      const commit = this.commits.get(head(ref) ?? '')
      return [
        200,
        commit ? [{ sha: commit.sha, commit: { committer: { date: commit.date } } }] : []
      ]
    }
    b = rest.match(/^\/contents\/(.+)$/)
    if (b) {
      return this.contents(method, repo, b[1], ref, body)
    }
    return [404, { message: `Not implemented: ${method} ${rest}` }]
  }

  private contents(
    method: string,
    repo: FakeRepo,
    path: string,
    ref: string,
    body: Record<string, unknown>
  ): [number, unknown] {
    const branch = String(body['branch'] ?? ref)
    const commitId = repo.branches.get(method === 'GET' ? ref : branch)
    const files = new Map(this.commits.get(commitId ?? '')?.files ?? [])
    const current = files.get(path)
    if (method === 'GET') {
      return current
        ? [
            200,
            { type: 'file', sha: current, content: this.blobs.get(current)!.toString('base64') }
          ]
        : [404, { message: 'Not Found' }]
    }
    if (current && !body['sha']) {
      return [422, { message: '"sha" wasn\'t supplied.' }]
    }
    if (current && body['sha'] !== current) {
      return [409, { message: `${path} does not match ${body['sha']}` }]
    }
    if (method === 'PUT') {
      if (!current && body['sha']) {
        return [409, { message: 'sha does not match' }]
      }
      const blob = this.putBlob(Buffer.from(String(body['content']), 'base64'))
      files.set(path, blob)
      repo.branches.set(branch, this.makeCommit(files, commitId ? [commitId] : []))
      return [current ? 200 : 201, { content: { sha: blob } }]
    }
    if (method === 'DELETE') {
      if (!current) {
        return [404, { message: 'Not Found' }]
      }
      files.delete(path)
      repo.branches.set(branch, this.makeCommit(files, [commitId!]))
      return [200, {}]
    }
    return [405, { message: 'Method not allowed' }]
  }
}
