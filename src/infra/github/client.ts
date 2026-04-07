/**
 * Thin GitHub REST API client — SPIKE-04.
 *
 * Uses native fetch (no Octokit). Stateless — instantiate via createGitHubClient().
 *
 * All methods accept `repo` as "owner/repo" string.
 * Auth: Authorization: Bearer token (PAT or GitHub App installation token).
 */

const GITHUB_API_BASE = "https://api.github.com"

// ── Error type ────────────────────────────────────────────────────────────────

export class GitHubApiError extends Error {
  readonly status: number
  readonly githubMessage: string

  constructor(status: number, githubMessage: string) {
    super(`GitHub API error ${status}: ${githubMessage}`)
    this.name = "GitHubApiError"
    this.status = status
    this.githubMessage = githubMessage
  }
}

// ── Response types ────────────────────────────────────────────────────────────

export interface GitHubIssueRef {
  number: number
  url: string
  nodeId: string
}

export interface GitHubIssue {
  number: number
  url: string
  nodeId: string
  title: string
  body: string | null
  state: "open" | "closed"
  labels: Array<{ name: string; color: string }>
  createdAt: string
  updatedAt: string
}

export interface GitHubPullRequestRef {
  number: number
  url: string
  nodeId: string
}

export interface GitHubPullRequest {
  number: number
  url: string
  nodeId: string
  title: string
  body: string | null
  state: "open" | "closed"
  draft: boolean
  merged: boolean
  head: { ref: string; sha: string }
  base: { ref: string; sha: string }
  createdAt: string
  updatedAt: string
}

export interface GitHubCommentRef {
  id: number
}

export interface GitHubRepoInfo {
  defaultBranch: string
  hasIssues: boolean
  isPrivate: boolean
}

// ── Raw GitHub API response shapes (internal) ─────────────────────────────────

interface RawGitHubIssue {
  number: number
  html_url: string
  node_id: string
  title: string
  body: string | null
  state: "open" | "closed"
  labels: Array<{ name: string; color: string }>
  created_at: string
  updated_at: string
}

interface RawGitHubPullRequest {
  number: number
  html_url: string
  node_id: string
  title: string
  body: string | null
  state: "open" | "closed"
  draft: boolean
  merged: boolean
  head: { ref: string; sha: string }
  base: { ref: string; sha: string }
  created_at: string
  updated_at: string
}

interface RawGitHubComment {
  id: number
}

interface RawGitHubRepo {
  default_branch: string
  has_issues: boolean
  private: boolean
}

interface RawGitHubErrorBody {
  message?: string
}

// ── Client factory ────────────────────────────────────────────────────────────

export interface GitHubClient {
  createIssue(
    repo: string,
    title: string,
    body: string,
    labels: string[],
  ): Promise<GitHubIssueRef>

  getIssue(repo: string, number: number): Promise<GitHubIssue>

  createPullRequest(
    repo: string,
    opts: { title: string; body: string; head: string; base: string; draft: boolean },
  ): Promise<GitHubPullRequestRef>

  getPullRequest(repo: string, number: number): Promise<GitHubPullRequest>

  addIssueComment(repo: string, number: number, body: string): Promise<GitHubCommentRef>

  getRepoInfo(repo: string): Promise<GitHubRepoInfo>

  /** Create a branch from baseBranch with a single file commit, so a PR can be opened against it. */
  createBranchWithCommit(
    repo: string,
    opts: { branchName: string; baseBranch: string; filePath: string; fileContent: string; commitMessage: string },
  ): Promise<void>

  /** Create a branch from baseBranch with multiple files in a single commit. */
  createBranchWithMultipleFiles(
    repo: string,
    opts: {
      branchName: string
      baseBranch: string
      files: { filePath: string; fileContent: string }[]
      commitMessage: string
    },
  ): Promise<void>
}

export function createGitHubClient(token: string): GitHubClient {
  const headers: Record<string, string> = {
    Authorization:  `Bearer ${token}`,
    Accept:         "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  }

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const init: RequestInit = {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    }
    const response = await fetch(`${GITHUB_API_BASE}${path}`, init)

    if (!response.ok) {
      let githubMessage = response.statusText
      try {
        const errBody = (await response.json()) as RawGitHubErrorBody
        if (typeof errBody.message === "string") {
          githubMessage = errBody.message
        }
      } catch {
        // ignore JSON parse errors on error body
      }
      throw new GitHubApiError(response.status, githubMessage)
    }

    return response.json() as Promise<T>
  }

  return {
    async createIssue(repo, title, body, labels) {
      const raw = await request<RawGitHubIssue>("POST", `/repos/${repo}/issues`, {
        title,
        body,
        labels,
      })
      return { number: raw.number, url: raw.html_url, nodeId: raw.node_id }
    },

    async getIssue(repo, number) {
      const raw = await request<RawGitHubIssue>("GET", `/repos/${repo}/issues/${number}`)
      return {
        number:    raw.number,
        url:       raw.html_url,
        nodeId:    raw.node_id,
        title:     raw.title,
        body:      raw.body,
        state:     raw.state,
        labels:    raw.labels,
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
      }
    },

    async createPullRequest(repo, { title, body, head, base, draft }) {
      const raw = await request<RawGitHubPullRequest>("POST", `/repos/${repo}/pulls`, {
        title,
        body,
        head,
        base,
        draft,
      })
      return { number: raw.number, url: raw.html_url, nodeId: raw.node_id }
    },

    async getPullRequest(repo, number) {
      const raw = await request<RawGitHubPullRequest>("GET", `/repos/${repo}/pulls/${number}`)
      return {
        number:    raw.number,
        url:       raw.html_url,
        nodeId:    raw.node_id,
        title:     raw.title,
        body:      raw.body,
        state:     raw.state,
        draft:     raw.draft,
        merged:    raw.merged,
        head:      raw.head,
        base:      raw.base,
        createdAt: raw.created_at,
        updatedAt: raw.updated_at,
      }
    },

    async addIssueComment(repo, number, body) {
      const raw = await request<RawGitHubComment>(
        "POST",
        `/repos/${repo}/issues/${number}/comments`,
        { body },
      )
      return { id: raw.id }
    },

    async getRepoInfo(repo) {
      const raw = await request<RawGitHubRepo>("GET", `/repos/${repo}`)
      return {
        defaultBranch: raw.default_branch,
        hasIssues:     raw.has_issues,
        isPrivate:     raw.private,
      }
    },

    async createBranchWithMultipleFiles(repo, { branchName, baseBranch, files, commitMessage }) {
      // 1. Get base branch SHA
      const baseRef = await request<{ object: { sha: string } }>("GET", `/repos/${repo}/git/ref/heads/${baseBranch}`)
      const baseSha = baseRef.object.sha

      // 2. Create blobs for all files in parallel
      const blobs = await Promise.all(
        files.map((f) =>
          request<{ sha: string }>("POST", `/repos/${repo}/git/blobs`, {
            content: f.fileContent,
            encoding: "utf-8",
          }),
        ),
      )

      // 3. Create tree with all files in one shot
      const tree = await request<{ sha: string }>("POST", `/repos/${repo}/git/trees`, {
        base_tree: baseSha,
        tree: files.map((f, i) => ({
          path: f.filePath,
          mode: "100644",
          type: "blob",
          sha: blobs[i]!.sha,
        })),
      })

      // 4. Create commit
      const commit = await request<{ sha: string }>("POST", `/repos/${repo}/git/commits`, {
        message: commitMessage,
        tree: tree.sha,
        parents: [baseSha],
      })

      // 5. Create branch ref (or update if it already exists)
      try {
        await request<unknown>("POST", `/repos/${repo}/git/refs`, {
          ref: `refs/heads/${branchName}`,
          sha: commit.sha,
        })
      } catch (err: unknown) {
        const ghErr = err as { message?: string; status?: number }
        if (ghErr?.message?.includes("Reference already exists") || ghErr?.status === 422) {
          await request<unknown>("PATCH", `/repos/${repo}/git/refs/heads/${branchName}`, {
            sha: commit.sha,
            force: true,
          })
        } else {
          throw err
        }
      }
    },

    async createBranchWithCommit(repo, { branchName, baseBranch, filePath, fileContent, commitMessage }) {
      // 1. Get base branch SHA
      const baseRef = await request<{ object: { sha: string } }>("GET", `/repos/${repo}/git/ref/heads/${baseBranch}`)
      const baseSha = baseRef.object.sha

      // 2. Create blob
      const blob = await request<{ sha: string }>("POST", `/repos/${repo}/git/blobs`, {
        content: fileContent,
        encoding: "utf-8",
      })

      // 3. Create tree with the new file
      const tree = await request<{ sha: string }>("POST", `/repos/${repo}/git/trees`, {
        base_tree: baseSha,
        tree: [{ path: filePath, mode: "100644", type: "blob", sha: blob.sha }],
      })

      // 4. Create commit
      const commit = await request<{ sha: string }>("POST", `/repos/${repo}/git/commits`, {
        message: commitMessage,
        tree: tree.sha,
        parents: [baseSha],
      })

      // 5. Create branch ref (or update if it already exists)
      try {
        await request<unknown>("POST", `/repos/${repo}/git/refs`, {
          ref: `refs/heads/${branchName}`,
          sha: commit.sha,
        })
      } catch (err: any) {
        // Branch already exists — update it
        if (err?.message?.includes("Reference already exists") || err?.status === 422) {
          await request<unknown>("PATCH", `/repos/${repo}/git/refs/heads/${branchName}`, {
            sha: commit.sha,
            force: true,
          })
        } else {
          throw err
        }
      }
    },
  }
}
