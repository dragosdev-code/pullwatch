/** WHY [mock isExtensionContext]: Node tests have no extension runtime; only `sendMessage` is under test. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PR_DATA_ACTION } from '../../../runtime-actions';
import { BackgroundActionClient } from '../background-action-client';

vi.mock('../../chrome-globals', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../../chrome-globals')>();
  return { ...mod, isExtensionContext: () => true };
});

describe('BackgroundActionClient', () => {
  const sendMessage = vi.fn();

  beforeEach(() => {
    sendMessage.mockReset();
  });

  it('unwraps success response data', async () => {
    sendMessage.mockResolvedValue({ success: true, data: ['pr'] });
    const runtime = { sendMessage } as never;
    const client = new BackgroundActionClient(runtime);

    await expect(client.dispatch(PR_DATA_ACTION.fetchAssignedPRs)).resolves.toEqual(['pr']);
    expect(sendMessage).toHaveBeenCalledWith({
      action: PR_DATA_ACTION.fetchAssignedPRs,
      payload: undefined,
    });
  });

  it('throws with response error when success is false', async () => {
    sendMessage.mockResolvedValue({ success: false, error: 'boom' });
    const client = new BackgroundActionClient({ sendMessage } as never);

    await expect(client.dispatch(PR_DATA_ACTION.fetchMergedPRs)).rejects.toThrow('boom');
  });
});
