/**
 * Runtime shape guard for `chrome.runtime.onMessage` payloads.
 *
 * The TypeScript type {@link RuntimeMessage} disappears at runtime, and the background's
 * onMessage listener historically did `message as RuntimeMessage` with no validation.
 * Even with sender id narrowed to our own extension, a refactor or popup regression could
 * deliver a malformed payload that drives the EventService dispatch table off-script.
 *
 * Schema accepts either the request shape (`{ action, payload? }`) or the broadcast shape
 * (`{ action, data }`); discriminator is `action` constrained to the canonical
 * {@link RuntimeAction} string set. `payload`/`data` stay typed as `unknown` because the
 * EventService action handlers each validate their own payload contracts downstream.
 */

import * as v from 'valibot';
import { RUNTIME_ACTION, type RuntimeAction } from './runtime-actions';
import type { RuntimeMessage } from './types';

const runtimeActionValues = Object.values(RUNTIME_ACTION) as [RuntimeAction, ...RuntimeAction[]];

const RuntimeMessageSchema = v.object({
  action: v.picklist(runtimeActionValues),
  payload: v.optional(v.unknown()),
  data: v.optional(v.unknown()),
});

/** Returns true iff `message` matches the {@link RuntimeMessage} shape. */
export function isRuntimeMessage(message: unknown): message is RuntimeMessage {
  return v.safeParse(RuntimeMessageSchema, message).success;
}
