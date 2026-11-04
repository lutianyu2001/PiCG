import { Injectable, inject } from '@angular/core'
import { GitHubClient } from '../github/github.client'
import { COMMIT_SUFFIX, encodeBase64Text } from '../github/repo-api'
import { CheckedRepo } from './token-check'

export const NO_JEKYLL = '.nojekyll'
const README = `# Images

This repository holds images managed by [PiCG](https://github.com/lutianyu2001/PiCG).
`

/** Prepares a repository for use: a first file for empty repositories, and `.nojekyll` for GitHub Pages. */
@Injectable({ providedIn: 'root' })
export class RepoSetup {
  private readonly gh = inject(GitHubClient)

  /** Creates `branch` at the head of `from`. */
  async createBranch(
    repo: { owner: string; name: string },
    branch: string,
    from: string,
    token?: string
  ) {
    const head = await this.gh.get<{ commit: { sha: string } }>(
      `/repos/${repo.owner}/${repo.name}/branches/${encodeURIComponent(from)}`,
      { token }
    )
    await this.gh.post(
      `/repos/${repo.owner}/${repo.name}/git/refs`,
      { ref: `refs/heads/${branch}`, sha: head.commit.sha },
      { token }
    )
  }

  async prepare(repo: CheckedRepo, token: string) {
    const base = `/repos/${repo.owner}/${repo.name}/contents`
    const put = (path: string, text: string, message: string, branch: string) =>
      this.gh.put(
        `${base}/${path}`,
        { message: message + COMMIT_SUFFIX, content: encodeBase64Text(text), branch },
        { token }
      )
    try {
      // The Git data API cannot work on a repository without commits, so an empty one gets a README first,
      // on its default branch; a chosen branch then starts from there.
      if (repo.empty) {
        await put('README.md', README, 'Set up repository', repo.defaultBranch)
        if (repo.branch !== repo.defaultBranch) {
          await this.createBranch(repo, repo.branch, repo.defaultBranch, token)
        }
      }
      const existing = await this.gh.find(`${base}/${NO_JEKYLL}`, {
        token,
        query: { ref: repo.branch }
      })
      if (!existing) {
        await put(NO_JEKYLL, '\n', 'Add .nojekyll', repo.branch)
      }
    } catch {
      // Not fatal: PiCG works without these files, and the next sign-in tries again.
    }
  }
}
