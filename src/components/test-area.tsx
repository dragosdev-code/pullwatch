import { useTestNotification } from '../hooks/use-notifications';
import { useSetGlobalError } from '../stores/global-error';

export const TestArea = () => {
  const setGlobalError = useSetGlobalError();
  const testNotificationMutation = useTestNotification();
  const playNotificationSound = () => {
    try {
      console.log('Playing notification sound in popup...');

      // Method 1: Try Web Audio API with better error handling
      try {
        const audioContext = new (window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();

        console.log('AudioContext state:', audioContext.state);

        // Resume audio context if it's suspended (required for user interaction)
        if (audioContext.state === 'suspended') {
          console.log('AudioContext suspended, resuming...');
          audioContext.resume().then(() => {
            playBeepSound(audioContext);
          });
        } else {
          playBeepSound(audioContext);
        }

        function playBeepSound(ctx: AudioContext) {
          // Create a more pleasant notification sound - two-tone beep
          const times = [0, 0.15];
          const frequencies = [800, 1000];

          times.forEach((time, index) => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(ctx.destination);

            oscillator.frequency.setValueAtTime(frequencies[index], ctx.currentTime + time);
            gainNode.gain.setValueAtTime(0.3, ctx.currentTime + time);
            gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + time + 0.1);

            oscillator.start(ctx.currentTime + time);
            oscillator.stop(ctx.currentTime + time + 0.1);
          });

          console.log('Web Audio API beep sounds triggered');
        }

        return;
      } catch (webAudioError) {
        console.warn('Web Audio API failed:', webAudioError);
      }
    } catch (error) {
      console.error('Failed to play sound in popup:', error);
    }
  };

  const handleTestNotification = async () => {
    try {
      await testNotificationMutation.mutateAsync();
      console.log('Test notification sent successfully');
      // Play sound in popup as well since background might not work
      setTimeout(() => playNotificationSound(), 200);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send test notification';
      setGlobalError(errorMessage);
    }
  };

  const handleTestOffscreenNotification = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(
          { action: 'testNotificationWithoutPopup' },
          (response: { success: boolean; error?: string }) => {
            if (chrome.runtime.lastError) {
              setGlobalError('Failed to send offscreen test notification');
              return;
            }

            if (response.success) {
              console.log('Offscreen test notification sent successfully');
            } else {
              setGlobalError(response.error || 'Failed to send offscreen test notification');
            }
          }
        );
      }
    } catch (err) {
      console.error('Failed to send offscreen test notification:', err);
      setGlobalError('Failed to send offscreen test notification');
    }
  };

  const handleStartTestInterval = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(
          { action: 'startTestInterval' },
          (response: { success: boolean; error?: string }) => {
            if (chrome.runtime.lastError) {
              setGlobalError('Failed to start test interval');
              return;
            }

            if (response.success) {
              console.log('Test interval started - notifications every 5 seconds');
            } else {
              setGlobalError(response.error || 'Failed to start test interval');
            }
          }
        );
      }
    } catch (err) {
      console.error('Failed to start test interval:', err);
      setGlobalError('Failed to start test interval');
    }
  };

  const handleStopTestInterval = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(
          { action: 'stopTestInterval' },
          (response: { success: boolean; error?: string }) => {
            if (chrome.runtime.lastError) {
              setGlobalError('Failed to stop test interval');
              return;
            }

            if (response.success) {
              console.log('Test interval stopped');
            } else {
              setGlobalError(response.error || 'Failed to stop test interval');
            }
          }
        );
      }
    } catch (err) {
      console.error('Failed to stop test interval:', err);
      setGlobalError('Failed to stop test interval');
    }
  };
  return (
    <div className="px-5 py-2 bg-blue-50 border-b border-blue-200">
      <div className="space-x-2 mb-2">
        <button
          onClick={handleTestNotification}
          className="text-xs text-blue-700 hover:text-blue-800 underline"
        >
          Test Notification
        </button>
        <button
          onClick={playNotificationSound}
          className="text-xs text-green-700 hover:text-green-800 underline"
        >
          Test Sound Only
        </button>
        <button
          onClick={handleTestOffscreenNotification}
          className="text-xs text-purple-700 hover:text-purple-800 underline"
        >
          Test Offscreen
        </button>
      </div>
      <div className="space-x-2">
        <button
          onClick={handleStartTestInterval}
          className="text-xs text-orange-700 hover:text-orange-800 underline font-semibold"
        >
          ▶ Start 5s Test
        </button>
        <button
          onClick={handleStopTestInterval}
          className="text-xs text-red-700 hover:text-red-800 underline font-semibold"
        >
          ⏹ Stop Test
        </button>
      </div>
    </div>
  );
};
