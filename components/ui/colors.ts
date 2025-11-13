/**
 * UI Color Tokens and Utilities
 * Deterministic color assignment for user cursors and presence
 */

// Vibrant, accessible color palette for user presence/cursors
export const USER_COLORS = [
  '#ef4444', // red-500
  '#10b981', // green-500
  '#3b82f6', // blue-500
  '#f59e0b', // amber-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#ec4899', // pink-500
  '#f97316', // orange-500
] as const;

/**
 * Get a deterministic color for a user based on their ID
 * Same user ID always returns the same color
 * @param userId - Unique user identifier
 * @returns Hex color string from USER_COLORS palette
 */
export function getColorForUserId(userId: string): string {
  if (!userId || userId.length === 0) {
    return USER_COLORS[0]; // fallback to red
  }

  // Simple but effective hash function
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  // Map to color palette
  const index = Math.abs(hash) % USER_COLORS.length;
  return USER_COLORS[index];
}

/**
 * Get initials from a name for avatar display
 * @param name - Full name or email
 * @returns 1-2 character initials
 */
export function getInitials(name: string): string {
  if (!name) return '?';

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }

  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/**
 * Design tokens for the application
 */
export const COLORS = {
  // Primary brand colors
  primary: '#3b82f6',
  primaryHover: '#2563eb',

  // Accent colors
  accent: '#8b5cf6',
  success: '#10b981',
  warning: '#f59e0b',
  danger: '#ef4444',

  // Neutral grays
  background: '#F7F8FA',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  borderHover: '#D1D5DB',

  // Text colors
  text: '#000000',
  textMuted: '#6B7280',
  textDisabled: '#9CA3AF',

  // Editor specific
  editorBackground: '#FFFFFF',
  editorText: '#000000',
  editorCaret: '#111111',
  editorSelection: 'rgba(59, 130, 246, 0.15)',
} as const;

/**
 * Spacing scale (px values)
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
} as const;

/**
 * Border radius tokens
 */
export const RADIUS = {
  sm: '0.375rem', // 6px
  md: '0.5rem',   // 8px
  lg: '0.75rem',  // 12px
  xl: '1rem',     // 16px
  '2xl': '1.5rem', // 24px
  full: '9999px',
} as const;

/**
 * Shadow tokens
 */
export const SHADOWS = {
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
  md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
  lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
  xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
} as const;
