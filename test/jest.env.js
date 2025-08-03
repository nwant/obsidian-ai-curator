// Set test environment variables
process.env.NODE_ENV = 'test';

// Suppress console output during tests unless specifically needed
if (!process.env.JEST_VERBOSE) {
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  
  console.error = (...args) => {
    // Only show errors that contain 'Error:' or are test-related
    const message = args.join(' ');
    if (message.includes('Error:') || message.includes('FAIL') || message.includes('AssertionError')) {
      originalConsoleError(...args);
    }
  };
  
  console.warn = (...args) => {
    // Only show warnings that are test-related
    const message = args.join(' ');
    if (message.includes('WARN') || message.includes('deprecated')) {
      originalConsoleWarn(...args);
    }
  };
}