import { debugLog, debugError, debugWarn, initializeDebugTools } from '../debug/debugLogger';
import { EVENT_PLAY_SOUND, EVENT_OFFSCREEN_READY } from '../common/constants';
import type { RuntimeMessage, MessageResponse } from '../common/types';

// Initialize debug tools for this context
initializeDebugTools();

debugLog('Offscreen document (offscreenMain.ts) loaded and script running.');

// Local interface to acknowledge webkitAudioContext for older browser compatibility
interface WindowWithLegacyAudio extends Window {
  webkitAudioContext?: typeof AudioContext;
}

/**
 * Plays a two-tone notification sound using the Web Audio API.
 * @param audioContext - The AudioContext to use for playback.
 */
function playBeepSound(audioContext: AudioContext): void {
  const times = [0, 0.15]; // Start times for the two tones
  const frequencies = [800, 1000]; // Frequencies of the two tones (Hz)
  const duration = 0.1; // Duration of each tone (seconds)
  const initialGain = 0.3; // Initial volume

  times.forEach((time, index) => {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.type = 'sine'; // A smoother sound than the default square wave
    oscillator.frequency.setValueAtTime(frequencies[index], audioContext.currentTime + time);
    gainNode.gain.setValueAtTime(initialGain, audioContext.currentTime + time);
    // Fade out the sound
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + time + duration);

    oscillator.start(audioContext.currentTime + time);
    oscillator.stop(audioContext.currentTime + time + duration);
  });

  debugLog('Offscreen notification sound playback initiated.');
}

/**
 * Handles the request to play a notification sound.
 * Creates or resumes an AudioContext and then plays the sound.
 */
async function handlePlayNotificationSound(): Promise<void> {
  try {
    debugLog('Attempting to play notification sound in offscreen document...');

    const globalWin = window as WindowWithLegacyAudio;
    const AudioContextConstructor = window.AudioContext || globalWin.webkitAudioContext;

    if (!AudioContextConstructor) {
      debugError('AudioContext is not supported in this environment.');
      return;
    }
    const audioContext = new AudioContextConstructor();
    debugLog('Offscreen AudioContext state:', audioContext.state);

    // Resume audio context if it's suspended (often required due to browser autoplay policies)
    if (audioContext.state === 'suspended') {
      debugLog('Offscreen AudioContext is suspended, attempting to resume...');
      await audioContext.resume();
      debugLog('AudioContext resumed.');
    }

    playBeepSound(audioContext);
  } catch (error) {
    debugError('Failed to play sound in offscreen document:', error);
  }
}

// Listen for messages from other parts of the extension (e.g., background script)
chrome.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
  debugLog('Offscreen document received message:', message, 'from sender:', sender);

  if (message.action === EVENT_PLAY_SOUND) {
    handlePlayNotificationSound()
      .then(() => {
        sendResponse({ success: true, data: 'Sound playback initiated' } as MessageResponse);
      })
      .catch((error) => {
        debugError('Error in handlePlayNotificationSound promise chain:', error);
        sendResponse({
          success: false,
          error: 'Failed to initiate sound playback',
        } as MessageResponse);
      });
    return true; // Indicates that the response will be sent asynchronously
  }
  // Handle other messages if needed

  // Default response for unhandled actions
  // sendResponse({ success: false, error: `Unknown action: ${message.action}` });
  return false; // No async response from this path
});

// Notify the background script that the offscreen document is ready and loaded.
// This is useful for the background script to know it can start sending messages.
function notifyBackgroundReady(): void {
  chrome.runtime
    .sendMessage({ action: EVENT_OFFSCREEN_READY } as RuntimeMessage)
    .then((response) => {
      debugLog('Successfully sent offscreenReady message to background. Response:', response);
    })
    .catch((error) => {
      // This can happen if the background script isn't listening yet (e.g., during initial load)
      debugWarn(
        'Failed to send offscreenReady message to background script. It might not be ready yet.',
        error.message
      );
      // Optionally retry or handle this case
    });
}

// Notify readiness when the script loads
notifyBackgroundReady();

debugLog('Offscreen document (offscreenMain.ts) event listeners attached and ready signal sent.');
