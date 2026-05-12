// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2024-2026 NestFleet contributors
// This file is part of NestFleet — https://github.com/nestfleet/nestfleet

/**
 * SSH execution helpers — FEAT-012 Reissue License.
 *
 * Thin wrappers around ssh2 for:
 *   sshWriteFile — SFTP upload a string/buffer to a remote path
 *   sshExec      — execute a shell command and assert exit code 0
 *
 * Both helpers open a new connection, perform their operation, and close.
 * They are intentionally stateless — no connection pooling needed at this scale.
 */

import { Client, type ConnectConfig } from "ssh2"
import { writeFile, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomBytes } from "node:crypto"

export interface SshOpts {
  host:       string
  port?:      number
  username:   string
  privateKey: string | Buffer
  /** Connection + operation timeout in ms. Default: 30_000. */
  timeoutMs?: number
}

// ── Internal: open an SSH connection ─────────────────────────────────────────

function connect(opts: SshOpts): Promise<Client> {
  return new Promise((resolve, reject) => {
    const conn = new Client()

    conn.on("ready", () => resolve(conn))
    conn.on("error", (err) => {
      conn.end()
      reject(err)
    })

    const cfg: ConnectConfig = {
      host:       opts.host,
      port:       opts.port ?? 22,
      username:   opts.username,
      privateKey: opts.privateKey,
      readyTimeout: opts.timeoutMs ?? 30_000,
    }

    conn.connect(cfg)
  })
}

// ── sshWriteFile ──────────────────────────────────────────────────────────────

/**
 * Write `content` to `remotePath` on the SSH host via SFTP.
 * Uses a local temp file as the staging area for fastPut.
 */
export async function sshWriteFile(
  opts:       SshOpts,
  remotePath: string,
  content:    string | Buffer,
): Promise<void> {
  const conn = await connect(opts)

  // Write content to a local temp file — ssh2 fastPut requires a file path
  const tmpPath = join(tmpdir(), `nf-reissue-${randomBytes(8).toString("hex")}.jwt`)
  try {
    await writeFile(tmpPath, content, "utf-8")

    await new Promise<void>((resolve, reject) => {
      conn.sftp((err, sftp) => {
        if (err) return reject(err)
        sftp.fastPut(tmpPath, remotePath, (putErr) => {
          if (putErr) return reject(putErr)
          resolve()
        })
      })
    })
  } finally {
    conn.end()
    await unlink(tmpPath).catch(() => {/* ignore cleanup errors */})
  }
}

// ── sshExec ───────────────────────────────────────────────────────────────────

export interface ExecResult {
  exitCode: number
  stdout:   string
  stderr:   string
}

/**
 * Execute `command` on the SSH host.
 * Resolves with stdout/stderr when exit code is 0.
 * Rejects with an error including stderr when exit code is non-zero.
 */
export async function sshExec(opts: SshOpts, command: string): Promise<ExecResult> {
  const conn = await connect(opts)

  try {
    return await new Promise<ExecResult>((resolve, reject) => {
      conn.exec(command, (err, stream) => {
        if (err) return reject(err)

        let stdout = ""
        let stderr = ""

        stream.on("data", (chunk: Buffer) => { stdout += chunk.toString() })
        stream.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString() })

        stream.on("close", (code: number) => {
          if (code !== 0) {
            reject(new Error(`SSH command '${command}' exited with code ${code}: ${stderr.trim()}`))
          } else {
            resolve({ exitCode: code, stdout, stderr })
          }
        })
      })
    })
  } finally {
    conn.end()
  }
}
