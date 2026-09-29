/**
 * The service seat's ONE door out of this package.  (S10/T2)
 *
 * ⚠ WHY THIS FILE EXISTS INSTEAD OF `"./context"` IN THE EXPORTS MAP — a control fired, and this
 * is its record: T2's first attempt exported `./context` wholesale, and the procedure-ladder pin
 * refused it ("the barrel does NOT export the session seam" — the exports map clause), because
 * `createContextForSession` lives in the same module and builds a context around an
 * already-resolved session, bypassing `evaluateAuthGate`. Publishing the module would have turned
 * a test seam into a session-forgery door one import away from any consumer. This file re-exports
 * EXACTLY the seat factory and nothing else; the session seam stays unpublished, and the pin
 * stays green because the property it protects is intact rather than because the assertion was
 * loosened.
 *
 * The one intended consumer is `apps/worker`'s deadline sweep (D1: the seat's context is built
 * in-process, never over HTTP — `createServiceSeatContext`'s own header carries the full
 * reasoning).
 */

export { createServiceSeatContext, type ServiceSeatContextOptions } from './context.js';
