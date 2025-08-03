# MCP Tools Test Harness

Comprehensive testing framework for all Obsidian AI Curator MCP tools.

## Current Status

The test harness infrastructure is fully implemented and ready for use. The actual MCP tools in `src/tools/` need to be implemented before the full test suite can run.

## Test Structure

```
test/
├── fixtures/           # Test vault and sample data
├── unit/              # Individual tool tests
├── integration/       # Multi-tool workflow tests
├── mocks/            # Mock implementations
├── helpers/          # Test utilities
└── benchmarks/       # Performance tests
```

## Test Categories

### 1. Unit Tests
Test each tool in isolation with mocked dependencies.

### 2. Integration Tests
Test realistic workflows combining multiple tools.

### 3. Edge Case Tests
Test error handling, malformed input, and boundary conditions.

### 4. Performance Tests
Ensure tools scale with large vaults (10k+ notes).

## Running Tests

```bash
# Run sample test (currently available)
npm test

# Verify test harness
npm run test:harness

# Once tools are implemented, you can run:
npm run test:all         # All tests
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests
npm run test:coverage    # With coverage report
npm run test:benchmark   # Performance benchmarks
```

## Currently Available

- **Test Infrastructure**: Full test harness with mocks and helpers
- **Sample Tests**: Basic tests to verify Node.js test runner works
- **Harness Verification**: Script to test the test framework itself
- **Benchmark Framework**: Performance testing setup ready

## Coming Soon

Once the MCP tools are implemented in `src/tools/`, the following tests will be available:
- Full unit test suite for all 25+ tools
- Integration tests for common workflows
- Edge case and error handling tests
- Performance benchmarks with large vaults

## Test Coverage Goals

- Unit test coverage: >90%
- Integration test coverage: >80%
- All error paths tested
- All edge cases documented