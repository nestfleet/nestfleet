/**
 * Unit tests: SSH execution layer — FEAT-012.
 *
 * NF-UNIT-SSH-01  sshExec resolves with stdout on exit code 0
 * NF-UNIT-SSH-02  sshExec rejects when exit code is non-zero
 * NF-UNIT-SSH-03  sshExec rejects on connection error
 * NF-UNIT-SSH-04  sshWriteFile resolves when SFTP put succeeds
 * NF-UNIT-SSH-05  sshWriteFile rejects when SFTP put fails
 * NF-UNIT-SSH-06  sshWriteFile rejects on connection error
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mock ssh2 before importing the module under test ─────────────────────────
// vi.hoisted() ensures these are defined before vi.mock() factories run.

const { mockSftpPut, mockExec, mockEnd, mockSftp, mockClient } = vi.hoisted(() => {
  const mockSftpPut = vi.fn()
  const mockExec    = vi.fn()
  const mockEnd     = vi.fn()
  const mockSftp    = vi.fn()
  const mockClient  = {
    connect: vi.fn(),
    on:      vi.fn(),
    sftp:    mockSftp,
    exec:    mockExec,
    end:     mockEnd,
  }
  return { mockSftpPut, mockExec, mockEnd, mockSftp, mockClient }
})

vi.mock("ssh2", () => ({
  // Regular function required — vitest 4.x uses Reflect.construct on the impl,
  // which fails for arrow functions.
  Client: vi.fn(function() { return mockClient }),
}))

const { sshExec, sshWriteFile } = await import("../../../src/fleet/ssh-exec.js")

const OPTS = {
  host:       "10.0.0.1",
  username:   "root",
  privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nfake\n-----END OPENSSH PRIVATE KEY-----",
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ── Helper: simulate connect + ready ─────────────────────────────────────────

function simulateReady() {
  mockClient.connect.mockImplementation(() => {
    // find the 'ready' handler registered via .on() and call it
    const readyCall = mockClient.on.mock.calls.find(([evt]) => evt === "ready")
    if (readyCall) readyCall[1]()
  })
}

function simulateConnectError(err: Error) {
  mockClient.connect.mockImplementation(() => {
    const errCall = mockClient.on.mock.calls.find(([evt]) => evt === "error")
    if (errCall) errCall[1](err)
  })
}

describe("sshExec", () => {
  it("NF-UNIT-SSH-01: resolves with stdout on exit code 0", async () => {
    simulateReady()

    mockExec.mockImplementation((_cmd: string, cb: (err: unknown, stream: unknown) => void) => {
      const stream = {
        on: vi.fn((evt: string, handler: (...args: unknown[]) => void) => {
          if (evt === "close") setTimeout(() => handler(0, null), 0)
          return stream
        }),
        stderr: { on: vi.fn() },
      }
      // Simulate stdout data
      stream.on.mockImplementation((evt: string, handler: (...args: unknown[]) => void) => {
        if (evt === "data") setTimeout(() => handler(Buffer.from("hello")), 0)
        if (evt === "close") setTimeout(() => handler(0, null), 5)
        return stream
      })
      cb(null, stream)
    })

    const result = await sshExec(OPTS, "echo hello")
    expect(result.exitCode).toBe(0)
    expect(mockEnd).toHaveBeenCalled()
  })

  it("NF-UNIT-SSH-02: rejects when exit code is non-zero", async () => {
    simulateReady()

    mockExec.mockImplementation((_cmd: string, cb: (err: unknown, stream: unknown) => void) => {
      const stream = {
        on: vi.fn((evt: string, handler: (...args: unknown[]) => void) => {
          if (evt === "close") setTimeout(() => handler(1, null), 0)
          return stream
        }),
        stderr: { on: vi.fn() },
      }
      cb(null, stream)
    })

    await expect(sshExec(OPTS, "false")).rejects.toThrow("exited with code 1")
    expect(mockEnd).toHaveBeenCalled()
  })

  it("NF-UNIT-SSH-03: rejects on connection error", async () => {
    simulateConnectError(new Error("Connection refused"))

    await expect(sshExec(OPTS, "echo hi")).rejects.toThrow("Connection refused")
    expect(mockEnd).toHaveBeenCalled()
  })
})

describe("sshWriteFile", () => {
  it("NF-UNIT-SSH-04: resolves when SFTP put succeeds", async () => {
    simulateReady()

    mockSftp.mockImplementation((cb: (err: unknown, sftp: unknown) => void) => {
      cb(null, { fastPut: mockSftpPut })
    })
    mockSftpPut.mockImplementation((_src: string, _dst: string, cb: (err: unknown) => void) => cb(null))

    await expect(sshWriteFile(OPTS, "/opt/nestfleet/license.jwt", "mock.jwt.token")).resolves.toBeUndefined()
    expect(mockEnd).toHaveBeenCalled()
  })

  it("NF-UNIT-SSH-05: rejects when SFTP put fails", async () => {
    simulateReady()

    mockSftp.mockImplementation((cb: (err: unknown, sftp: unknown) => void) => {
      cb(null, { fastPut: mockSftpPut })
    })
    mockSftpPut.mockImplementation((_src: string, _dst: string, cb: (err: Error) => void) =>
      cb(new Error("Permission denied"))
    )

    await expect(sshWriteFile(OPTS, "/opt/nestfleet/license.jwt", "token")).rejects.toThrow("Permission denied")
    expect(mockEnd).toHaveBeenCalled()
  })

  it("NF-UNIT-SSH-06: rejects on SSH connection error", async () => {
    simulateConnectError(new Error("Timeout"))

    await expect(sshWriteFile(OPTS, "/opt/nestfleet/license.jwt", "token")).rejects.toThrow("Timeout")
    expect(mockEnd).toHaveBeenCalled()
  })
})
