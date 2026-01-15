# PubMed Medical Chatbot POC

A proof-of-concept medical chatbot that searches PubMed articles by disease using MeSH terms and E-utilities API.

## Features

- **Disease Search**: Query PubMed using MeSH (Medical Subject Headings) for accurate medical article retrieval
- **MCP Server**: Model Context Protocol server for integration with AI assistants
- **CLI Tools**: Command-line tools for testing and exploration
- **Basic Chatbot**: Interactive Q&A that synthesizes answers from PubMed articles

## Quick Start

```bash
# Install dependencies
npm install

# Test search functionality
node src/cli-search.js "Multiple Endocrine Neoplasia Type 1"

# Run interactive chatbot
node src/chatbot.js

# Start MCP server (for AI integration)
node src/mcp-server.js
```

## Components

### 1. PubMed Client (`src/pubmed-client.js`)

Core API client for NCBI E-utilities:

```javascript
import { searchByDisease, searchPubMed, fetchDetails } from './pubmed-client.js';

// Search by disease name (uses MeSH terms)
const results = await searchByDisease('Breast Cancer', {
  maxResults: 10,
  includeAbstracts: true,
  recentYears: 5,
});

// Custom PubMed query
const pmids = await searchPubMed('"Diabetes Mellitus"[MeSH] AND therapy[sh]');
const articles = await fetchDetails(pmids);
```

### 2. MCP Server (`src/mcp-server.js`)

Exposes PubMed search as MCP tools:

| Tool | Description |
|------|-------------|
| `search_disease` | Search articles by disease name |
| `search_pubmed` | Run custom PubMed query |
| `get_article` | Fetch article by PMID |
| `build_mesh_query` | Preview generated MeSH query |

**MCP Config for Claude Desktop:**
```json
{
  "mcpServers": {
    "pubmed": {
      "command": "node",
      "args": ["/path/to/pubmed-medical-chatbot/src/mcp-server.js"]
    }
  }
}
```

### 3. CLI Search (`src/cli-search.js`)

```bash
# Basic search
node src/cli-search.js "Parkinson's Disease"

# With options
node src/cli-search.js "Type 2 Diabetes" --max 10 --recent 3

# JSON output
node src/cli-search.js "Multiple Endocrine Neoplasia" --json
```

### 4. Chatbot (`src/chatbot.js`)

```bash
# Interactive mode
node src/chatbot.js

# Piped input
echo "What are the treatments for MEN1?" | node src/chatbot.js
```

## MeSH Query Examples

The client builds MeSH queries automatically:

| Disease Input | Generated Query |
|--------------|-----------------|
| "Breast Cancer" | `("Breast Cancer"[MeSH Terms] OR "Breast Cancer"[Title/Abstract]) AND (therapy[Subheading] OR diagnosis[Subheading] ...)` |
| "MEN1" | Same pattern with disease-specific terms |

## API Reference

### `searchByDisease(disease, options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxResults` | number | 10 | Maximum articles to return |
| `includeAbstracts` | boolean | true | Fetch full abstracts |
| `meshOnly` | boolean | false | Only search MeSH terms (stricter) |
| `recentYears` | number | null | Limit to last N years |

### Return Format

```javascript
{
  disease: "Multiple Endocrine Neoplasia Type 1",
  query: "...", // Generated PubMed query
  totalResults: 5,
  articles: [
    {
      pmid: "12345678",
      title: "Article Title",
      abstract: "Full abstract text...",
      authors: ["Smith J", "Jones A"],
      journal: "Journal Name",
      pubDate: "2024 Jan",
      doi: "10.xxxx/xxxxx",
      meshTerms: ["MeSH Term 1", "MeSH Term 2"],
      pubmedUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/"
    }
  ]
}
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│  User Question  │────▶│  Disease Extractor│
└─────────────────┘     └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  MeSH Query Builder│
                        └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  PubMed E-utilities│
                        │  - ESearch (PMIDs) │
                        │  - EFetch (details)│
                        └────────┬─────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │  Article Parser   │
                        │  (XML → JSON)     │
                        └────────┬─────────┘
                                 │
                                 ▼
┌─────────────────┐     ┌──────────────────┐
│  LLM Response   │◀────│  Context + Prompt │
└─────────────────┘     └──────────────────┘
```

## Future Improvements

1. **LLM Integration**: Connect to OpenAI/Anthropic API for actual response synthesis
2. **MeSH Term Lookup**: Use NCBI MeSH API to validate/suggest MeSH terms
3. **Citation Formatting**: Support different citation styles
4. **Full-Text Access**: Integrate with PubMed Central for free full-text articles
5. **Caching**: Cache frequent queries to reduce API calls
6. **Rate Limiting**: Respect NCBI guidelines (3 requests/second without API key)

## Notes

- No API key required for basic usage (but recommended for production)
- Rate limited to 3 requests/second without API key
- NCBI E-utilities docs: https://www.ncbi.nlm.nih.gov/books/NBK25499/

## License

POC - Internal use only
