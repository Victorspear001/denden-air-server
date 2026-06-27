import { randomUUID } from 'crypto';

/**
 * Generates a new UUID v4 string for use as primary keys.
 * @returns {string} A new UUID v4
 */
export function generateId() {
  return randomUUID();
}
