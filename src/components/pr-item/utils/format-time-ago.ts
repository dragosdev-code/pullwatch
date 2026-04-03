import { formatDistanceToNow } from 'date-fns';

export const formatTimeAgo = (dateString: string): string => {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Unknown date';
    }
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (error) {
    console.warn('Invalid date string:', dateString, error);
    return 'Unknown date';
  }
};
