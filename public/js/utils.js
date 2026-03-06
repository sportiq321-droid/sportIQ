// ==================== UTILITY FUNCTIONS ====================

/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML insertion
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

/**
 * Safely parses a number, returning null for empty/invalid values
 * Properly handles 0 as a valid number (unlike || operator)
 * @param {string|number} value - Value to parse
 * @returns {number|null} Parsed number or null
 */
function parseNumberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

/**
 * Format a date for display
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

// Make available globally
window.escapeHtml = escapeHtml;
window.parseNumberOrNull = parseNumberOrNull;
window.formatDate = formatDate;

/**
 * Show loading state on a button
 * @param {HTMLButtonElement} button - Button element
 * @param {boolean} loading - Whether to show loading state
 * @param {string} originalText - Original button text to restore
 */
function setButtonLoading(button, loading, originalText = 'Submit') {
  if (loading) {
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = 'Loading...';
  } else {
    button.disabled = false;
    button.textContent = button.dataset.originalText || originalText;
  }
}

/**
 * Handle image load errors by showing default avatar
 * @param {HTMLImageElement} img - Image element
 */
function handleImageError(img) {
  img.onerror = null; // Prevent infinite loop
  img.src = '/img/defaultavatar.jpg';
}

// Make available globally
window.setButtonLoading = setButtonLoading;
window.handleImageError = handleImageError;

/**
 * Show an inline error message
 * @param {HTMLElement} element - Error message element
 * @param {string} message - Error message to show (empty string to hide)
 */
function showError(element, message) {
  if (!element) return;
  if (message) {
    element.textContent = message;
    element.classList.remove('hidden');
  } else {
    element.textContent = '';
    element.classList.add('hidden');
  }
}

// Make available globally
window.showError = showError;