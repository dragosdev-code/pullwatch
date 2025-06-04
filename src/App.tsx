import { useState, useEffect } from 'react';
import { Header, PRList, Footer, type PullRequest } from './components';

function App() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prs, setPrs] = useState<PullRequest[]>([]);
  const [showTitleParticles, setShowTitleParticles] = useState(false);
  const [hasEverLoaded, setHasEverLoaded] = useState(false);
  const [lastFetch, setLastFetch] = useState<number | null>(null);

  // Load PRs from storage on component mount
  useEffect(() => {
    loadPRsFromStorage();

    // Listen for messages from background script
    const messageListener = (message: { action: string }) => {
      if (message.action === 'playAudioInPopup') {
        console.log('Received request to play audio in popup');
        playNotificationSound();
      }
    };

    if (typeof chrome !== 'undefined' && chrome.runtime) {
      chrome.runtime.onMessage.addListener(messageListener);

      // Cleanup
      return () => {
        chrome.runtime.onMessage.removeListener(messageListener);
      };
    }
  }, []);

  const loadPRsFromStorage = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        // We're in the extension context
        chrome.runtime.sendMessage(
          { action: 'getPRs' },
          (response: { prs: PullRequest[]; lastFetch: number | null }) => {
            if (chrome.runtime.lastError) {
              console.error('Error getting PRs from background:', chrome.runtime.lastError);
              return;
            }

            if (response) {
              const storedPRs = response.prs || [];
              setPrs(storedPRs);
              setLastFetch(response.lastFetch);
              setHasEverLoaded(storedPRs.length > 0 || response.lastFetch !== null);
            }
          }
        );
      }
    } catch (error) {
      console.error('Failed to load PRs from storage:', error);
    }
  };

  const handleRefresh = async () => {
    setIsLoading(true);
    setError(null);

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        // We're in the extension context - ask background script to fetch
        chrome.runtime.sendMessage(
          { action: 'fetchPRs' },
          (response: { success: boolean; error?: string }) => {
            if (chrome.runtime.lastError) {
              setError('Failed to communicate with background script');
              setIsLoading(false);
              return;
            }

            if (response.success) {
              // Reload data from storage after successful fetch
              loadPRsFromStorage();
            } else {
              setError(response.error || 'Failed to fetch PRs');
            }
            setIsLoading(false);
          }
        );
      } else {
        // Fallback for development/web context
        setError('Extension context not available. Please load as Chrome extension.');
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Failed to fetch PRs:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to fetch pull requests. Please try again.'
      );
      setIsLoading(false);
    }
  };

  const handleTitleParticlesComplete = () => {
    setShowTitleParticles(false);
  };

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

      // Method 2: Try HTML5 Audio with a system sound
      try {
        console.log('Trying system beep sound...');
        // Use a simple beep sound that should work cross-platform
        const audio = new Audio(
          'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQ4AAAC0tbWyrrKos6ixqyAA'
        );
        audio.volume = 0.5;
        audio
          .play()
          .then(() => {
            console.log('HTML5 Audio beep played successfully');
          })
          .catch((playError) => {
            console.warn('HTML5 Audio play failed:', playError);
          });
        return;
      } catch (htmlAudioError) {
        console.warn('HTML5 Audio failed:', htmlAudioError);
      }

      console.log('All audio methods attempted');
    } catch (error) {
      console.error('Failed to play sound in popup:', error);
    }
  };

  const handleTestNotification = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(
          { action: 'testNotification' },
          (response: { success: boolean; error?: string }) => {
            if (chrome.runtime.lastError) {
              setError('Failed to send test notification');
              return;
            }

            if (response.success) {
              console.log('Test notification sent successfully');
              // Play sound in popup as well since background might not work
              setTimeout(() => playNotificationSound(), 200);
            } else {
              setError(response.error || 'Failed to send test notification');
            }
          }
        );
      }
    } catch (err) {
      console.error('Failed to send test notification:', err);
      setError('Failed to send test notification');
    }
  };

  const handleTestOffscreenNotification = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(
          { action: 'testNotificationWithoutPopup' },
          (response: { success: boolean; error?: string }) => {
            if (chrome.runtime.lastError) {
              setError('Failed to send offscreen test notification');
              return;
            }

            if (response.success) {
              console.log('Offscreen test notification sent successfully');
            } else {
              setError(response.error || 'Failed to send offscreen test notification');
            }
          }
        );
      }
    } catch (err) {
      console.error('Failed to send offscreen test notification:', err);
      setError('Failed to send offscreen test notification');
    }
  };

  const handleStartTestInterval = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(
          { action: 'startTestInterval' },
          (response: { success: boolean; error?: string }) => {
            if (chrome.runtime.lastError) {
              setError('Failed to start test interval');
              return;
            }

            if (response.success) {
              console.log('Test interval started - notifications every 5 seconds');
            } else {
              setError(response.error || 'Failed to start test interval');
            }
          }
        );
      }
    } catch (err) {
      console.error('Failed to start test interval:', err);
      setError('Failed to start test interval');
    }
  };

  const handleStopTestInterval = async () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        chrome.runtime.sendMessage(
          { action: 'stopTestInterval' },
          (response: { success: boolean; error?: string }) => {
            if (chrome.runtime.lastError) {
              setError('Failed to stop test interval');
              return;
            }

            if (response.success) {
              console.log('Test interval stopped');
            } else {
              setError(response.error || 'Failed to stop test interval');
            }
          }
        );
      }
    } catch (err) {
      console.error('Failed to stop test interval:', err);
      setError('Failed to stop test interval');
    }
  };

  const formatLastFetch = (timestamp: number | null) => {
    if (!timestamp) return null;
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / (1000 * 60));

    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 minute ago';
    if (minutes < 60) return `${minutes} minutes ago`;

    const hours = Math.floor(minutes / 60);
    if (hours === 1) return '1 hour ago';
    return `${hours} hours ago`;
  };

  return (
    <div className="w-[380px] h-[400px] bg-white rounded-2xl relative overflow-hidden border-0 shadow-none flex flex-col">
      <Header
        prCount={prs.length}
        isLoading={isLoading}
        showTitleParticles={showTitleParticles}
        onRefresh={handleRefresh}
        onTitleParticlesComplete={handleTitleParticlesComplete}
      />

      {error && (
        <div className="px-5 py-3 bg-red-50 border-b border-red-200">
          <p className="text-xs text-red-600">{error}</p>
          <button
            onClick={() => setError(null)}
            className="text-xs text-red-700 hover:text-red-800 underline mt-1"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Debug test notification buttons - can be removed later */}
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

      {lastFetch && (
        <div className="px-5 py-2 bg-gray-50 border-b border-gray-200">
          <p className="text-xs text-gray-500">Last updated: {formatLastFetch(lastFetch)}</p>
        </div>
      )}

      <PRList prs={prs} newPrIds={new Set()} hasEverLoaded={hasEverLoaded} />

      <Footer />
    </div>
  );
}

export default App;
