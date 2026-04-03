import { describe, expect, it } from 'vitest';
import { effectiveAssignedNotifyOnDrafts } from '../effective-assigned-draft-notify';

/**
 * Background must treat draft notifications as off unless both flags allow it; otherwise duplicate
 * toasts (see JSDoc on `effectiveAssignedNotifyOnDrafts`).
 */
describe('effectiveAssignedNotifyOnDrafts', () => {
  it.each([
    {
      name: 'both on → effective true',
      assigned: { notifyOnDrafts: true, showDraftsInList: true },
      expected: true,
    },
    {
      name: 'notify off, show on → effective false',
      assigned: { notifyOnDrafts: false, showDraftsInList: true },
      expected: false,
    },
    {
      name: 'notify on, show off (invalid pair) → effective false',
      assigned: { notifyOnDrafts: true, showDraftsInList: false },
      expected: false,
    },
    {
      name: 'both off → effective false',
      assigned: { notifyOnDrafts: false, showDraftsInList: false },
      expected: false,
    },
  ])('$name', ({ assigned, expected }) => {
    expect(effectiveAssignedNotifyOnDrafts(assigned)).toBe(expected);
  });
});
