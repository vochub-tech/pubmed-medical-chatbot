#!/usr/bin/env node
/**
 * PubMed Medical Chatbot MCP Server
 * 
 * Enhanced MCP server with:
 * - QuickUMLS integration for plain English → MeSH mapping
 * - LLM synthesis for patient-friendly answers
 * - Integration-ready for grll/pubmedmcp
 * 
 * Based on grll/pubmedmcp patterns, extended with our features
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { searchByDisease, searchPubMed, fetchDetails, buildDiseaseQuery } from './pubmed-client.js';
import { mapToMeshTerms, buildQueryFromMapping, processPatientQuery } from './quickumls-mapper.js';
import { synthesizeAnswer, synthesizeFollowUp, validateConfig } from './llm-synthesis.js';

const server = new Server(
  {
    name: 'pubmed-medical-chatbot',
    version: '0.2.0',
    description: 'Medical chatbot MCP server with QuickUMLS mapping and LLM synthesis',
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
      // === Original PubMed Tools ===
      {
        name: 'search_disease',
        description: 'Search PubMed for articles about a specific disease. Uses MeSH terms for accurate medical article retrieval. Returns articles with titles, abstracts, authors, and MeSH tags.',
        inputSchema: {
          type: 'object',
          properties: {
            disease: {
              type: 'string',
              description: 'Disease name to search for (e.g., "Multiple Endocrine Neoplasia Type 1", "Diabetes Mellitus")',
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

      // === NEW: QuickUMLS Integration Tools ===
      {
        name: 'map_patient_query',
        description: 'Map plain English patient language to medical MeSH terms. Handles queries like "my hands shake" → "Tremor", "stomach pain" → "Abdominal Pain". Returns mapped terms with confidence scores.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Patient\'s natural language query (e.g., "my hands shake when I\'m nervous")',
            },
            useQuickUMLS: {
              type: 'boolean',
              description: 'Use QuickUMLS server if available (requires local setup)',
              default: false,
            },
            minConfidence: {
              type: 'number',
              description: 'Minimum confidence threshold for term mapping (0-1, default: 0.3)',
              default: 0.3,
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'patient_search',
        description: 'Full pipeline: Map patient query to MeSH terms and search PubMed. Combines map_patient_query + search_disease. Returns mapping info + articles.',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Patient\'s natural language query',
            },
            maxResults: {
              type: 'number',
              description: 'Maximum articles to return (default: 5)',
              default: 5,
            },
            recentYears: {
              type: 'number',
              description: 'Limit to recent years',
            },
          },
          required: ['query'],
        },
      },

      // === NEW: LLM Synthesis Tools ===
      {
        name: 'answer_question',
        description: 'Answer a patient\'s medical question using PubMed research. Full pipeline: maps query → searches PubMed → synthesizes plain English answer with citations. Requires LLM API key (OPENAI_API_KEY or ANTHROPIC_API_KEY).',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'Patient\'s medical question',
            },
            maxArticles: {
              type: 'number',
              description: 'Maximum articles to use for synthesis (default: 5)',
              default: 5,
            },
            provider: {
              type: 'string',
              enum: ['openai', 'anthropic'],
              description: 'LLM provider to use (default: openai)',
              default: 'openai',
            },
            includeDisclaimer: {
              type: 'boolean',
              description: 'Include medical disclaimer (default: true)',
              default: true,
            },
          },
          required: ['question'],
        },
      },
      {
        name: 'synthesize_articles',
        description: 'Synthesize a patient-friendly answer from provided PubMed articles. Use when you already have articles and just need LLM synthesis.',
        inputSchema: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The question to answer',
            },
            pmids: {
              type: 'array',
              items: { type: 'string' },
              description: 'Array of PMIDs to synthesize from',
            },
            provider: {
              type: 'string',
              enum: ['openai', 'anthropic'],
              description: 'LLM provider (default: openai)',
            },
          },
          required: ['question', 'pmids'],
        },
      },
      {
        name: 'check_llm_config',
        description: 'Check if LLM APIs are configured. Returns status of OpenAI and Anthropic API keys.',
        inputSchema: {
          type: 'object',
          properties: {},
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
      // === Original PubMed Tools ===
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

      // === QuickUMLS Tools ===
      case 'map_patient_query': {
        const mapping = await mapToMeshTerms(args.query, {
          useQuickUMLS: args.useQuickUMLS || false,
          minConfidence: args.minConfidence || 0.3,
        });
        
        // Also build the PubMed query
        const pubmedQuery = buildQueryFromMapping(mapping);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                originalQuery: args.query,
                mappedTerms: mapping.mappedTerms,
                unmappedPhrases: mapping.unmappedPhrases,
                overallConfidence: mapping.confidence,
                method: mapping.method,
                suggestedPubMedQuery: pubmedQuery,
              }, null, 2),
            },
          ],
        };
      }

      case 'patient_search': {
        // Step 1: Map patient query to MeSH
        const processed = await processPatientQuery(args.query);
        
        // Step 2: Search PubMed with generated query
        const pmids = await searchPubMed(processed.pubmedQuery, {
          maxResults: args.maxResults || 5,
        });
        
        let articles = [];
        if (pmids.length) {
          articles = await fetchDetails(pmids);
        }

        // Apply date filter if specified
        if (args.recentYears && articles.length) {
          const cutoffYear = new Date().getFullYear() - args.recentYears;
          articles = articles.filter(a => {
            const yearMatch = a.pubDate?.match(/\d{4}/);
            return yearMatch && parseInt(yearMatch[0]) >= cutoffYear;
          });
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                patientQuery: args.query,
                mapping: processed.mapping,
                pubmedQuery: processed.pubmedQuery,
                totalResults: articles.length,
                articles,
              }, null, 2),
            },
          ],
        };
      }

      // === LLM Synthesis Tools ===
      case 'answer_question': {
        // Full pipeline: map → search → synthesize
        const processed = await processPatientQuery(args.question);
        
        // Search PubMed
        const pmids = await searchPubMed(processed.pubmedQuery, {
          maxResults: args.maxArticles || 5,
        });
        
        let articles = [];
        if (pmids.length) {
          articles = await fetchDetails(pmids);
        }

        // Synthesize answer
        const synthesis = await synthesizeAnswer(args.question, articles, {
          provider: args.provider || 'openai',
          includeDisclaimer: args.includeDisclaimer !== false,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                question: args.question,
                meshTerms: processed.mapping.mappedTerms.map(t => t.meshTerm),
                answer: synthesis.answer,
                citations: synthesis.citations,
                confidence: synthesis.confidence,
                metadata: synthesis.metadata,
              }, null, 2),
            },
          ],
        };
      }

      case 'synthesize_articles': {
        // Fetch the specified articles
        const articles = await fetchDetails(args.pmids);
        
        // Synthesize
        const synthesis = await synthesizeAnswer(args.question, articles, {
          provider: args.provider || 'openai',
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                question: args.question,
                answer: synthesis.answer,
                citations: synthesis.citations,
                confidence: synthesis.confidence,
                metadata: synthesis.metadata,
              }, null, 2),
            },
          ],
        };
      }

      case 'check_llm_config': {
        const config = validateConfig();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(config, null, 2),
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
          text: JSON.stringify({ 
            error: error.message,
            tool: name,
            hint: name === 'answer_question' || name === 'synthesize_articles' 
              ? 'Ensure OPENAI_API_KEY or ANTHROPIC_API_KEY is set'
              : undefined,
          }),
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
  console.error('PubMed Medical Chatbot MCP Server v0.2.0 running on stdio');
  console.error('Tools: search_disease, map_patient_query, patient_search, answer_question, and more');
  
  // Check LLM config on startup
  const llmStatus = validateConfig();
  console.error(`LLM Status: ${llmStatus.message}`);
}

main().catch(console.error);
