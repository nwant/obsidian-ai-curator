export default {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/test/**/*.test.js',
    '**/__tests__/**/*.js'
  ],
  
  // Ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/obsidian-ai-curator-plugin/'
  ],
  
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/test/jest.setup.js'],
  
  // Coverage configuration
  collectCoverage: false,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/benchmarks/**',
    '!src/mcp-server.js' // Main entry point
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Test execution
  maxWorkers: 1, // Force sequential execution for integration tests
  
  // Custom test projects for different test types
  projects: [
    {
      displayName: 'unit',
      testMatch: ['<rootDir>/test/unit/**/*.test.js'],
      maxWorkers: 4, // Unit tests can run in parallel
      testEnvironment: 'node'
    },
    {
      displayName: 'integration', 
      testMatch: ['<rootDir>/test/integration/**/*.test.js'],
      maxWorkers: 1, // Integration tests must run sequentially
      testEnvironment: 'node'
    }
  ],
  
  // Transform configuration for ES modules
  transform: {},
  
  // Module file extensions
  moduleFileExtensions: ['js', 'json'],
  
  // Verbose output
  verbose: true,
  
  // Error handling
  bail: false, // Don't stop on first failure
  
  // Custom environment variables
  setupFiles: ['<rootDir>/test/jest.env.js']
};