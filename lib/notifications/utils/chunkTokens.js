// lib/notifications/utils/chunkTokens.js
/**
 * Splits an array into chunks of size n.
 * @template T
 * @param {T[]} array
 * @param {number} size
 * @returns {T[][]}
 */
export default function chunkTokens(array, size) {
  const res = [];
  for (let i = 0; i < array.length; i += size) {
    res.push(array.slice(i, i + size));
  }
  return res;
} 