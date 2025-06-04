// Offscreen document for playing notification sounds
// This runs in a regular DOM context where AudioContext is available

console.log('Offscreen document loaded for audio playback');

// Function to play notification sound
function playNotificationSound() {
  try {
    console.log('Playing notification sound in offscreen document...');

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    console.log('Offscreen AudioContext state:', audioContext.state);

    // Resume audio context if it's suspended
    if (audioContext.state === 'suspended') {
      console.log('Offscreen AudioContext suspended, resuming...');
      audioContext.resume().then(() => {
        playBeepSound(audioContext);
      });
    } else {
      playBeepSound(audioContext);
    }

    function playBeepSound(ctx) {
      // Create a pleasant two-tone notification sound
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

      console.log('Offscreen notification sound played successfully');
    }
  } catch (error) {
    console.error('Failed to play sound in offscreen document:', error);
  }
}

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen document received message:', message);

  if (message.action === 'playNotificationSound') {
    playNotificationSound();
    sendResponse({ success: true });
  }
});

// Let the background script know this offscreen document is ready
chrome.runtime.sendMessage({ action: 'offscreenReady' }).catch(() => {
  // Background script might not be ready to receive this message yet
  console.log('Background script not ready to receive offscreenReady message');
});
