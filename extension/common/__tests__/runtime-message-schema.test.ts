import { describe, expect, it } from 'vitest';
import { isRuntimeMessage } from '../runtime-message-schema';
import { RUNTIME_ACTION } from '../runtime-actions';

describe('isRuntimeMessage', () => {
  it('accepts a request message with a known action', () => {
    expect(
      isRuntimeMessage({ action: RUNTIME_ACTION.fetchAssignedPRs, payload: { force: true } })
    ).toBe(true);
  });

  it('accepts a broadcast message with data', () => {
    expect(
      isRuntimeMessage({ action: RUNTIME_ACTION.settingsUpdated, data: { hello: 'world' } })
    ).toBe(true);
  });

  it('accepts an action-only message (no payload, no data)', () => {
    expect(isRuntimeMessage({ action: RUNTIME_ACTION.getSettings })).toBe(true);
  });

  it('rejects an unknown action string', () => {
    expect(isRuntimeMessage({ action: 'totallyMadeUpAction' })).toBe(false);
  });

  it('rejects a missing action', () => {
    expect(isRuntimeMessage({ payload: 'x' })).toBe(false);
  });

  it('rejects a non-object message', () => {
    expect(isRuntimeMessage(null)).toBe(false);
    expect(isRuntimeMessage(undefined)).toBe(false);
    expect(isRuntimeMessage('string')).toBe(false);
    expect(isRuntimeMessage(42)).toBe(false);
  });
});
