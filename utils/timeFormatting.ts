/**
 * Utility functions for formatting timestamps in mobile app
 * Converts UTC timestamps to local browser timezone
 */

/**
 * Format a UTC timestamp string to local timezone with date and time
 * @param timestamp - ISO format timestamp string (UTC)
 * @returns Formatted date string in local timezone (e.g., "Jan 25, 2026, 10:07 PM EST")
 */
export const formatTimestampToLocal = (timestamp: string | null | undefined): string => {
  if (!timestamp) return 'No date';
  
  try {
    // Parse the UTC timestamp
    const date = new Date(timestamp);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return timestamp; // Return original if invalid
    }
    
    // Format to local timezone with date, time, and timezone
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });
  } catch (error) {
    console.error('Error formatting timestamp:', error);
    return timestamp; // Return original on error
  }
};

/**
 * Format a UTC timestamp string to local timezone (date only)
 * @param timestamp - ISO format timestamp string (UTC)
 * @returns Formatted date string in local timezone (e.g., "Jan 25, 2026")
 */
export const formatDateToLocal = (timestamp: string | null | undefined): string => {
  if (!timestamp) return 'No date';
  
  try {
    const date = new Date(timestamp);
    
    if (isNaN(date.getTime())) {
      return timestamp;
    }
    
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return timestamp;
  }
};

/**
 * Format a UTC timestamp string to local timezone (time only)
 * @param timestamp - ISO format timestamp string (UTC)
 * @returns Formatted time string in local timezone (e.g., "10:07 PM")
 */
export const formatTimeToLocal = (timestamp: string | null | undefined): string => {
  if (!timestamp) return 'No time';
  
  try {
    const date = new Date(timestamp);
    
    if (isNaN(date.getTime())) {
      return timestamp;
    }
    
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  } catch (error) {
    console.error('Error formatting time:', error);
    return timestamp;
  }
};
