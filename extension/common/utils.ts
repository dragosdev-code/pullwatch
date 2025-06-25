/**
 * Formats a date string or Date object into a human-readable "time ago" string.
 * Example: "5 minutes ago", "2 hours ago", "3 days ago".
 * @param dateString - The date string (parsable by Date constructor) or Date object.
 * @returns A string representing how long ago the date was.
 */
export function formatTimeAgo(dateString: string | Date): string {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString;
  const now = new Date();
  const seconds = Math.round((now.getTime() - date.getTime()) / 1000);

  if (isNaN(seconds) || seconds < 0) {
    // Handle invalid or future dates gracefully
    return 'just now'; // Or 'in the future' or some other placeholder
  }

  const minutes = Math.round(seconds / 60);
  const hours = Math.round(minutes / 60);
  const days = Math.round(hours / 24);
  const weeks = Math.round(days / 7);
  const months = Math.round(days / 30.44); // Average days in a month
  const years = Math.round(days / 365.25); // Account for leap years

  if (seconds < 5) {
    return 'just now';
  }
  if (seconds < 60) {
    return `${seconds} seconds ago`;
  }
  if (minutes < 60) {
    return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`;
  }
  if (hours < 24) {
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (days < 7) {
    return days === 1 ? '1 day ago' : `${days} days ago`;
  }
  if (weeks < 5) {
    // Up to 4 weeks, then show months
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
  }
  if (months < 12) {
    return months === 1 ? '1 month ago' : `${months} months ago`;
  }
  return years === 1 ? '1 year ago' : `${years} years ago`;
}

/**
 * A simple utility to add a delay.
 * @param ms - Milliseconds to delay.
 * @returns A promise that resolves after the delay.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Add other shared utility functions here as needed, for example:
// - Validation functions
// - Data transformation functions
