import { format, parse, isValid, startOfDay } from 'date-fns';

export class DateManager {
  static config = {};
  
  /**
   * Initialize with config
   */
  static init(config) {
    this.config = config || {};
  }

  /**
   * Format a date according to configuration
   * This is THE method for formatting dates consistently
   * @throws {Error} If the date cannot be parsed or is invalid
   */
  static formatDate(date = new Date()) {
    const parsedDate = date instanceof Date ? date : this.parseDate(date);
    
    if (!parsedDate || !isValid(parsedDate)) {
      throw new Error(`Invalid date: ${date}`);
    }
    
    const dateFormat = this.config.dateFormat || 'yyyy-MM-dd';
    const includeTime = this.config.includeTimeInDates || false;
    
    // If time should be included, use ISO format
    if (includeTime) {
      return parsedDate.toISOString();
    }
    
    // Otherwise use configured date format
    return format(parsedDate, dateFormat);
  }

  /**
   * Get current date in configured format
   * @param {number} daysOffset - Optional offset in days from today (positive or negative)
   * @returns {string} Formatted date string
   */
  static getCurrentDate(daysOffset = 0) {
    const date = new Date();
    if (daysOffset !== 0) {
      date.setDate(date.getDate() + daysOffset);
    }
    return this.formatDate(date);
  }

  /**
   * Get today's date formatted
   * @returns {string} Today's date in configured format
   */
  static getToday() {
    return this.getCurrentDate(0);
  }

  /**
   * Get yesterday's date formatted
   * @returns {string} Yesterday's date in configured format
   */
  static getYesterday() {
    return this.getCurrentDate(-1);
  }

  /**
   * Get tomorrow's date formatted
   * @returns {string} Tomorrow's date in configured format
   */
  static getTomorrow() {
    return this.getCurrentDate(1);
  }

  /**
   * Parse a date string in various formats
   */
  static parseDate(dateString) {
    if (!dateString) return null;
    
    // Try common date formats
    const formats = [
      'yyyy-MM-dd',
      'MM/dd/yyyy',
      'dd/MM/yyyy',
      'yyyy-MM-dd HH:mm:ss',
      'MMM dd, yyyy',
      'MMMM dd, yyyy'
    ];
    
    for (const fmt of formats) {
      try {
        const parsed = parse(dateString, fmt, new Date());
        if (isValid(parsed)) {
          return parsed;
        }
      } catch (e) {
        // Continue trying other formats
      }
    }
    
    // Try JavaScript's built-in parser as fallback
    const jsDate = new Date(dateString);
    if (isValid(jsDate)) {
      return jsDate;
    }
    
    return null;
  }


  /**
   * Get daily note filename for a given date
   */
  static getDailyNoteFilename(date = new Date(), pattern = 'yyyy-MM-dd') {
    return format(date, pattern) + '.md';
  }

  /**
   * Parse daily note filename to get date
   */
  static parseDailyNoteFilename(filename, pattern = 'yyyy-MM-dd') {
    // Remove .md extension
    const nameWithoutExt = filename.replace(/\.md$/, '');
    
    try {
      const parsed = parse(nameWithoutExt, pattern, new Date());
      if (isValid(parsed)) {
        return parsed;
      }
    } catch (e) {
      // Invalid format
    }
    
    return null;
  }

  /**
   * Get date range for daily note queries
   */
  static getDailyNoteRange(date = new Date()) {
    const start = startOfDay(date);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    end.setMilliseconds(-1);
    
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      date: format(start, 'yyyy-MM-dd')
    };
  }

  /**
   * Format date for display
   */
  static formatForDisplay(date, formatStr = 'MMMM d, yyyy') {
    if (!date) return '';
    
    const parsed = date instanceof Date ? date : this.parseDate(date);
    if (!parsed || !isValid(parsed)) return String(date);
    
    return format(parsed, formatStr);
  }

  /**
   * Get relative date descriptions
   */
  static getRelativeDate(daysOffset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    
    const formattedDate = format(date, 'yyyy-MM-dd');
    
    if (daysOffset === 0) return { date: formattedDate, description: 'today' };
    if (daysOffset === -1) return { date: formattedDate, description: 'yesterday' };
    if (daysOffset === 1) return { date: formattedDate, description: 'tomorrow' };
    if (daysOffset < -1) return { date: formattedDate, description: `${Math.abs(daysOffset)} days ago` };
    if (daysOffset > 1) return { date: formattedDate, description: `in ${daysOffset} days` };
  }

  /**
   * Validate date in content matches expected format
   */
  static validateDateFields(content, expectedFormats = {}) {
    try {
      const parsed = matter(content);
      const warnings = [];
      
      // Check common date fields
      const dateFields = ['created', 'modified', 'date', 'published'];
      
      for (const field of dateFields) {
        if (parsed.data[field]) {
          const value = parsed.data[field];
          const expectedFormat = expectedFormats[field] || 'yyyy-MM-dd';
          
          // Try to parse the date
          const parsedDate = this.parseDate(value);
          if (!parsedDate) {
            warnings.push({
              field,
              value,
              issue: 'Invalid date format',
              suggestion: this.getCurrentDate(expectedFormat)
            });
          } else {
            // Check if it matches expected format
            const reformatted = format(parsedDate, expectedFormat);
            if (String(value) !== reformatted) {
              warnings.push({
                field,
                value,
                issue: 'Date format mismatch',
                suggestion: reformatted
              });
            }
          }
        }
      }
      
      return warnings;
    } catch (error) {
      return [{
        field: 'content',
        issue: 'Failed to parse frontmatter',
        error: error.message
      }];
    }
  }
}