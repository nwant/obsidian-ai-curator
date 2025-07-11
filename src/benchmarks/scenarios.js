export async function loadScenarios() {
  return {
    find_recent_files: {
      name: "Find Recent Files",
      description: "Search for files modified in the last 7 days",
      expectedResults: [],  // Will be dynamically determined based on actual vault content
      steps: [
        {
          name: "Scan vault for recent files",
          tool: "vault_scan",
          params: {
            patterns: ["**/*.md"],
            includeStats: true
          }
        },
        {
          name: "Filter by metadata",
          tool: "find_by_metadata",
          params: {
            modifiedAfter: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
          }
        }
      ]
    },

    search_by_frontmatter: {
      name: "Search by Frontmatter",
      description: "Find notes with specific frontmatter fields",
      expectedResults: [],
      steps: [
        {
          name: "Find notes with type field",
          tool: "find_by_metadata",
          params: {
            frontmatter: {
              type: { "$exists": true }
            }
          }
        },
        {
          name: "Find notes with tags field",
          tool: "find_by_metadata",
          params: {
            frontmatter: {
              tags: { "$exists": true, "$empty": false }
            }
          }
        }
      ]
    },

    complex_metadata_query: {
      name: "Complex Metadata Query",
      description: "Find notes with multiple metadata conditions",
      expectedResults: [],
      steps: [
        {
          name: "Find notes with multiple conditions",
          tool: "find_by_metadata",
          params: {
            frontmatter: {
              type: { "$exists": true },
              tags: { "$empty": false }
            },
            minWords: 50
          }
        },
        {
          name: "Find notes missing common fields",
          tool: "find_by_metadata",
          params: {
            frontmatter: {
              description: { "$exists": false }
            }
          }
        },
        {
          name: "Find notes with empty fields",
          tool: "find_by_metadata",
          params: {
            frontmatter: {
              tags: { "$empty": true }
            }
          }
        }
      ]
    },

    content_search_patterns: {
      name: "Content Search Patterns",
      description: "Test different content search strategies",
      expectedResults: [],
      steps: [
        {
          name: "Search for common words",
          tool: "search_content",
          params: {
            query: "the",
            maxResults: 5
          }
        },
        {
          name: "Search for markdown headers",
          tool: "search_content",
          params: {
            query: "##",
            maxResults: 10
          }
        },
        {
          name: "Search for links",
          tool: "search_content",
          params: {
            query: "[[",
            maxResults: 10,
            contextLines: 1
          }
        }
      ]
    },

    vault_scan_performance: {
      name: "Vault Scan Performance",
      description: "Test vault scanning with different patterns",
      expectedResults: [],
      steps: [
        {
          name: "Scan all markdown files",
          tool: "vault_scan",
          params: {
            patterns: ["**/*.md"],
            includeStats: false
          }
        },
        {
          name: "Scan with stats enabled",
          tool: "vault_scan",
          params: {
            patterns: ["**/*.md"],
            includeStats: true
          }
        }
      ]
    },

    batch_read_test: {
      name: "Batch Read Test",
      description: "Test reading multiple notes in batch",
      expectedResults: [],
      steps: [
        {
          name: "Find notes to read",
          tool: "find_by_metadata",
          params: {
            frontmatter: {},
            maxWords: 1000
          }
        },
        {
          name: "Read first batch of notes",
          tool: "read_notes",
          params: {
            paths: [] // Will be populated dynamically from previous step
          }
        }
      ]
    },

    date_range_search: {
      name: "Date Range Search",
      description: "Test searching within date ranges",
      expectedResults: [],
      steps: [
        {
          name: "Find notes from last 30 days",
          tool: "find_by_metadata",
          params: {
            modifiedAfter: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
          }
        },
        {
          name: "Find notes with created date field",
          tool: "find_by_metadata",
          params: {
            frontmatter: {
              created: { "$exists": true }
            }
          }
        }
      ]
    },

    word_count_filtering: {
      name: "Word Count Filtering",
      description: "Test filtering by word count ranges",
      expectedResults: [],
      steps: [
        {
          name: "Find short notes",
          tool: "find_by_metadata",
          params: {
            maxWords: 100
          }
        },
        {
          name: "Find medium-length notes",
          tool: "find_by_metadata",
          params: {
            minWords: 100,
            maxWords: 500
          }
        },
        {
          name: "Find long notes",
          tool: "find_by_metadata",
          params: {
            minWords: 500
          }
        }
      ]
    }
  };
}

export function getScenarioNames() {
  return [
    "find_recent_files",
    "search_by_frontmatter",
    "complex_metadata_query",
    "content_search_patterns",
    "vault_scan_performance",
    "batch_read_test",
    "date_range_search",
    "word_count_filtering"
  ];
}