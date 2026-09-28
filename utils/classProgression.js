/**
 * @module utils/classProgression
 * @fileoverview Defines the class hierarchy for automatic "next class" resolution
 * during student promotion.
 */

/**
 * Ordered list of class names from lowest to highest.
 * This must match the class names used in the `classrooms.class` column.
 */
const CLASS_ORDER = [
  'Nursery',
  'LKG',
  'UKG',
  '1', '2', '3', '4', '5',
  '6', '7', '8', '9', '10'
];

/**
 * Get the next class for a given class name.
 * Returns null if the student is in the highest class (10) — meaning "passed out".
 * 
 * @param {string} currentClass - The current class name (case-insensitive)
 * @returns {string|null} The next class name, or null if the student has completed the highest class
 * 
 * @example
 * getNextClass('3')       // '4'
 * getNextClass('UKG')     // '1'
 * getNextClass('10')      // null (passed out)
 * getNextClass('Nursery') // 'LKG'
 */
export function getNextClass(currentClass) {
  if (!currentClass) return null;

  const idx = CLASS_ORDER.findIndex(
    c => c.toLowerCase() === currentClass.toString().toLowerCase().trim()
  );

  if (idx === -1) return null;           // Unknown class
  if (idx === CLASS_ORDER.length - 1) return null; // Highest class — passed out

  return CLASS_ORDER[idx + 1];
}

/**
 * Get the numeric index (rank) of a class name.
 * Useful for sorting classes in order.
 * 
 * @param {string} className
 * @returns {number} Index in CLASS_ORDER (0-based), or -1 if not found
 */
export function getClassIndex(className) {
  if (!className) return -1;
  return CLASS_ORDER.findIndex(
    c => c.toLowerCase() === className.toString().toLowerCase().trim()
  );
}

/**
 * Check if a class is the highest (final) class.
 * Students in this class should be marked as "passed_out" during promotion.
 * 
 * @param {string} className
 * @returns {boolean}
 */
export function isHighestClass(className) {
  if (!className) return false;
  return className.toString().toLowerCase().trim() === CLASS_ORDER[CLASS_ORDER.length - 1].toLowerCase();
}

/**
 * Get the full ordered list of class names.
 * 
 * @returns {string[]}
 */
export function getClassOrder() {
  return [...CLASS_ORDER];
}

/**
 * Sort an array of objects by their class name in progression order.
 * 
 * @param {Array<Object>} items - Array of objects with a `class` property
 * @param {string} [classKey='class'] - The key containing the class name
 * @returns {Array<Object>} Sorted array
 */
export function sortByClassOrder(items, classKey = 'class') {
  return [...items].sort((a, b) => {
    const idxA = getClassIndex(a[classKey]);
    const idxB = getClassIndex(b[classKey]);
    return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
  });
}
