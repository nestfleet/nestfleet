/**
 * In-memory SSE session registry — DEFERRED-05.
 *
 * Connects the reply writer (agent or operator) to the open SSE stream
 * for a given chat session. One Map entry per active browser connection.
 *
 * Limitation: single-process only. Multi-instance deployments would need
 * a Redis pub/sub layer as the upgrade path (not in scope for v2.0).
 */

export interface ChatPushMessage {
  type: "message" | "typing" | "ping"
  role?: "agent" | "operator"
  text?: string
  ts: string
}

type Listener = (msg: ChatPushMessage) => void

const _listeners = new Map<string, Set<Listener>>()

/**
 * Subscribe to incoming push messages for a session.
 * Returns an unsubscribe function — call it when the SSE connection closes.
 */
export function subscribe(sessionId: string, fn: Listener): () => void {
  if (!_listeners.has(sessionId)) {
    _listeners.set(sessionId, new Set())
  }
  _listeners.get(sessionId)!.add(fn)

  return () => {
    const set = _listeners.get(sessionId)
    if (set) {
      set.delete(fn)
      if (set.size === 0) _listeners.delete(sessionId)
    }
  }
}

/**
 * Push a message to all open SSE connections for this session.
 * No-op if nobody is listening (user has the tab closed).
 */
export function publish(sessionId: string, msg: ChatPushMessage): void {
  _listeners.get(sessionId)?.forEach((fn) => fn(msg))
}

/** Returns true if at least one SSE connection is open for this session. */
export function hasListeners(sessionId: string): boolean {
  const set = _listeners.get(sessionId)
  return !!(set && set.size > 0)
}
