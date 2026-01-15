#!/usr/bin/env node
/**
 * PubMed MCP Server
 * 
 * Provides PubMed search tools via Model Context Protocol
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { searchByDisease, searchPubMed, fetchDetails, buildDiseaseQuery } from './pubmed-client.js';

const server = new Server(
  {
    name: 'pubmed-server',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'search_disease',
        description: 'Search PubMed for articles about a specific disease. Uses MeSH terms for accurate medical article retrieval. Returns articles with titles, abstracts, authors, and MeSH tags.',
        inputSchema: {
          type: 'object',
          properties: {
            disease: {
              type: 'string',
              description: 'Disease name to search for (e.g., "Multiple Endocrine Neoplasia Type 1", "Diabetes Mellitus", "Breast Cancer")',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of articles to return (default: 5, max: 20)',
              default: 5,
            },
            recentYears: {
              type: 'number',
              description: 'Limit to articles from the last N years (optional)',
            },
            includeAbstracts: {
              type: 'boolean',
              description: 'Include full abstracts (default: true)',
              default: true,
            },
          },
          required: ['disease'],
        },
      },
      {
        name: 'search_pubmed',
        description: 'Run a custom PubMed query. Supports MeSH terms, field tags, and boolean operators.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'PubMed search query (e.g., \'"Breast Neoplasms"[MeSH] AND therapy[sh]\')',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum number of articles to return (default: 10)',
              default: 10,
            },
            includeAbstracts: {
              type: 'boolean',
              description: 'Include full abstracts (default: true)',
              default: true,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'get_article',
        description: 'Fetch full details for a specific PubMed article by PMID.',
        inputSchema: {
          type: 'object',
          properties: {
            pmid: {
              type: 'string',
              description: 'PubMed ID (PMID) of the article',
            },
          },
          required: ['pmid'],
        },
      },
      {
        name: 'build_mesh_query',
        description: 'Build a MeSH-based query for a disease without executing it. Useful for understanding query structure.',
        inputSchema: {
          type: 'object',
          properties: {
            disease: {
              type: 'string',
              description: 'Disease name',
            },
            meshOnly: {
              type: 'boolean',
              description: 'Only search MeSH terms (stricter matching)',
              default: false,
            },
          },
          required: ['disease'],
        },
      },
    ],
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'search_disease': {
        const results = await searchByDisease(args.disease, {
          maxResults: Math.min(args.maxResults || 5, 20),
          recentYears: args.recentYears,
          includeAbstracts: args.includeAbstracts !== false,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results, null, 2),
            },
          ],
        };
      }

      case 'search_pubmed': {
        const pmids = await searchPubMed(args.query, {
          maxResults: args.maxResults || 10,
        });
        
        let articles = [];
        if (pmids.length && args.includeAbstracts !== false) {
          articles = await fetchDetails(pmids);
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query: args.query,
                totalResults: pmids.length,
                articles,
              }, null, 2),
            },
          ],
        };
      }

      case 'get_article': {
        const articles = await fetchDetails([args.pmid]);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(articles[0] || { error: 'Article not found' }, null, 2),
            },
          ],
        };
      }

      case 'build_mesh_query': {
        const query = buildDiseaseQuery(args.disease, {
          meshOnly: args.meshOnly || false,
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ disease: args.disease, query }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: error.message }),
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('PubMed MCP Server running on stdio');
}

main().catch(console.error);
