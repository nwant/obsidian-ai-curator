import matter from 'gray-matter';
import { format, parse, isValid, startOfDay } from 'date-fns';

export class DateManager {
  /**
   * Get current date in specified format
   */
  static getCurrentDate(dateFormat = 'yyyy-MM-dd') {
    return format(new Date(), dateFormat);
  }

  /**
   * Get current datetime in ISO format
   */
  static getCurrentDateTime() {
    return new Date().toISOString();
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
   * Ensure content has proper created/modified timestamps
   */
  static ensureTimestamps(content, options = {}) {
    const { 
      isNewFile = true, 
      dateFormat = 'yyyy-MM-dd',
      includeTime = false 
    } = options;
    
    try {
      const parsed = matter(content);
      const now = new Date();
      
      // Set created date for new files (always override to ensure correct date)
      if (isNewFile) {
        parsed.data.created = includeTime 
          ? now.toISOString() 
          : format(now, dateFormat);
      }
      
      // Always update modified date
      parsed.data.modified = includeTime 
        ? now.toISOString() 
        : format(now, dateFormat);
      
      // Validate and fix existing dates
      if (parsed.data.created) {
        const createdDate = this.parseDate(parsed.data.created);
        if (createdDate) {
          parsed.data.created = includeTime 
            ? createdDate.toISOString() 
            : format(createdDate, dateFormat);
        }
      }
      
      return matter.stringify(parsed.content, parsed.data);
    } catch (error) {
      console.error('Failed to ensure timestamps:', error);
      return content;
    }
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