import { jest } from '@jest/globals';

// Extend Jest timeout for integration tests
jest.setTimeout(30000);

// Custom Jest matchers for the test harness
expect.extend({
  // Matcher for checking if a tool result is successful
  toBeSuccessful(received) {
    const pass = received && received.success === true;
    if (pass) {
      return {
        message: () => `expected ${received} not to be successful`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be successful but got ${JSON.stringify(received)}`,
        pass: false,
      };
    }
  },

  // Matcher for checking if a file exists in test results
  toContainFile(received, filename) {
    if (!received || !received.files) {
      return {
        message: () => `expected result to have files array but got ${JSON.stringify(received)}`,
        pass: false,
      };
    }
    
    const pass = received.files.some(file => 
      (typeof file === 'string' && file.includes(filename)) ||
      (file.path && file.path.includes(filename))
    );
    
    if (pass) {
      return {
        message: () => `expected files not to contain ${filename}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected files to contain ${filename} but got ${received.files.map(f => f.path || f).join(', ')}`,
        pass: false,
      };
    }
  },

  // Matcher for checking tag arrays
  toContainTag(received, tag) {
    if (!Array.isArray(received)) {
      return {
        message: () => `expected ${received} to be an array`,
        pass: false,
      };
    }
    
    const pass = received.includes(tag);
    if (pass) {
      return {
        message: () => `expected tags not to contain ${tag}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected tags to contain ${tag} but got [${received.join(', ')}]`,
        pass: false,
      };
    }
  }
});

// Global test utilities
global.sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Mock console for cleaner test output
const originalConsoleLog = console.log;
console.log = (...args) => {
  if (process.env.JEST_VERBOSE) {
    originalConsoleLog(...args);
  }
};