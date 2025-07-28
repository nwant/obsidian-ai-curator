export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Obsidian API Server',
    version: '1.0.0',
    description: 'Local API server that exposes Obsidian vault operations for the MCP server',
    contact: {
      name: 'Obsidian AI Curator'
    }
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: 'Local development server'
    }
  ],
  paths: {
    '/': {
      get: {
        summary: 'API Information',
        description: 'Get basic information about the API',
        responses: {
          '200': {
            description: 'API information',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    version: { type: 'string' },
                    docs: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/health': {
      get: {
        summary: 'Health Check',
        description: 'Check if the API server is running and connected to Obsidian',
        responses: {
          '200': {
            description: 'Server is healthy',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/SuccessResponse'
                },
                example: {
                  success: true,
                  data: {
                    status: 'ok',
                    version: '1.0.0',
                    vault: 'My Obsidian Vault'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/search': {
      get: {
        summary: 'Search Vault',
        description: 'Search for content across all notes using Obsidian\'s search index',
        parameters: [
          {
            name: 'query',
            in: 'query',
            required: true,
            description: 'Search query',
            schema: { type: 'string' },
            example: 'machine learning'
          },
          {
            name: 'maxResults',
            in: 'query',
            description: 'Maximum number of results to return',
            schema: { 
              type: 'integer',
              default: 50,
              minimum: 1,
              maximum: 200
            }
          },
          {
            name: 'contextLines',
            in: 'query',
            description: 'Number of context lines around matches',
            schema: { 
              type: 'integer',
              default: 2,
              minimum: 0,
              maximum: 10
            }
          }
        ],
        responses: {
          '200': {
            description: 'Search results',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          path: { type: 'string' },
                          basename: { type: 'string' },
                          matches: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                line: { type: 'integer' },
                                text: { type: 'string' },
                                start: { type: 'integer' },
                                end: { type: 'integer' }
                              }
                            }
                          },
                          score: { type: 'number' },
                          context: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Bad request - missing query parameter',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/api/tags': {
      get: {
        summary: 'Get Tags',
        description: 'Get tags from the vault, either all tags or for a specific file',
        parameters: [
          {
            name: 'path',
            in: 'query',
            description: 'Optional file path to get tags for a specific file',
            schema: { type: 'string' },
            example: 'Notes/AI Research.md'
          }
        ],
        responses: {
          '200': {
            description: 'Tag information',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        path: { type: 'string' },
                        tags: {
                          type: 'object',
                          additionalProperties: {
                            type: 'integer',
                            description: 'Tag count'
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '404': {
            description: 'File not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/api/links': {
      get: {
        summary: 'Get Links',
        description: 'Get outgoing links and/or backlinks for a file',
        parameters: [
          {
            name: 'path',
            in: 'query',
            required: true,
            description: 'File path',
            schema: { type: 'string' },
            example: 'Notes/Project Overview.md'
          },
          {
            name: 'type',
            in: 'query',
            description: 'Type of links to retrieve',
            schema: { 
              type: 'string',
              enum: ['outgoing', 'backlinks', 'both'],
              default: 'both'
            }
          }
        ],
        responses: {
          '200': {
            description: 'Link information',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        path: { type: 'string' },
                        outgoingLinks: {
                          type: 'array',
                          items: { type: 'string' }
                        },
                        backlinks: {
                          type: 'array',
                          items: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Bad request - missing path parameter',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          '404': {
            description: 'File not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/api/metadata': {
      get: {
        summary: 'Get Metadata',
        description: 'Get metadata for one or more files including frontmatter, tags, links, and headings',
        parameters: [
          {
            name: 'paths',
            in: 'query',
            required: true,
            description: 'Comma-separated list of file paths',
            schema: { type: 'string' },
            example: 'Notes/AI.md,Notes/ML.md'
          }
        ],
        responses: {
          '200': {
            description: 'File metadata',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          path: { type: 'string' },
                          frontmatter: {
                            type: 'object',
                            additionalProperties: true
                          },
                          tags: {
                            type: 'array',
                            items: { type: 'string' }
                          },
                          links: {
                            type: 'array',
                            items: { type: 'string' }
                          },
                          headings: {
                            type: 'array',
                            items: {
                              type: 'object',
                              properties: {
                                text: { type: 'string' },
                                level: { type: 'integer' }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Bad request - missing paths parameter',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/api/vault-info': {
      get: {
        summary: 'Get Vault Information',
        description: 'Get general information about the Obsidian vault',
        responses: {
          '200': {
            description: 'Vault information',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        fileCount: { type: 'integer' },
                        totalSize: { type: 'integer' },
                        adapter: { type: 'string' }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/rename-file': {
      get: {
        summary: 'Rename File',
        description: 'Rename a file and automatically update all links throughout the vault',
        parameters: [
          {
            name: 'oldPath',
            in: 'query',
            required: true,
            description: 'Current file path',
            schema: { type: 'string' },
            example: 'Notes/Old Name.md'
          },
          {
            name: 'newPath',
            in: 'query',
            required: true,
            description: 'New file path',
            schema: { type: 'string' },
            example: 'Notes/New Name.md'
          }
        ],
        responses: {
          '200': {
            description: 'File renamed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        oldPath: { type: 'string' },
                        newPath: { type: 'string' },
                        linksUpdated: { 
                          type: 'boolean',
                          description: 'Always true - Obsidian automatically updates all links'
                        },
                        file: {
                          type: 'object',
                          properties: {
                            path: { type: 'string' },
                            name: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Bad request - missing parameters',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          '404': {
            description: 'File not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          '500': {
            description: 'Failed to rename file',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    },
    '/api/move-file': {
      get: {
        summary: 'Move File',
        description: 'Move a file to a new location and automatically update all links throughout the vault',
        parameters: [
          {
            name: 'sourcePath',
            in: 'query',
            required: true,
            description: 'Current file path',
            schema: { type: 'string' },
            example: 'Notes/My Note.md'
          },
          {
            name: 'targetPath',
            in: 'query',
            required: true,
            description: 'Target file path (including filename)',
            schema: { type: 'string' },
            example: 'Archive/My Note.md'
          }
        ],
        responses: {
          '200': {
            description: 'File moved successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: {
                      type: 'object',
                      properties: {
                        sourcePath: { type: 'string' },
                        targetPath: { type: 'string' },
                        linksUpdated: { 
                          type: 'boolean',
                          description: 'Always true - Obsidian automatically updates all links'
                        },
                        file: {
                          type: 'object',
                          properties: {
                            path: { type: 'string' },
                            name: { type: 'string' },
                            parent: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          '400': {
            description: 'Bad request - missing parameters',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          '404': {
            description: 'File not found',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          },
          '500': {
            description: 'Failed to move file',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      SuccessResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: true
          },
          data: {
            type: 'object',
            description: 'Response data'
          }
        }
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          success: {
            type: 'boolean',
            example: false
          },
          error: {
            type: 'string',
            description: 'Error message'
          }
        }
      }
    }
  }
};