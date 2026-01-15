# PubMed Medical Chatbot

[![GitHub Repo](https://img.shields.io/badge/vochub--tech/pubmed--medical--chatbot-blue)](https://github.com/vochub-tech/pubmed-medical-chatbot)

A medical chatbot that translates plain English patient questions into MeSH terms, searches PubMed for relevant research, and synthesizes patient-friendly answers with citations.

## Features

- **🩺 Plain English Input**: Ask questions like "my hands shake when I'm nervous" - automatic mapping to MeSH terms (Tremor, Anxiety)
- **🔬 PubMed Search**: Accurate medical article retrieval using MeSH (Medical Subject Headings)
- **🤖 LLM Synthesis**: Generate plain English answers from research (OpenAI/Anthropic)
- **📚 Inline Citations**: Every claim cited with PMID references
- **⚠️ Medical Disclaimer**: Automatic safety disclaimers
- **🔌 MCP Server**: Model Context Protocol integration for AI assistants

## Quick Start

```bash
# Install dependencies
npm install

# Run interactive chatbot
node src/chatbot.js

# Or pipe a question
echo "What causes tremors?" | node src/chatbot.js

# Start MCP server
node src/mcp-server.js

# Test term mapping
npm run test:mapper
```

## LLM Configuration

For full answer synthesis, set one of these API keys:

```bash
# OpenAI (default)
export OPENAI_API_KEY=sk-...

# Or Anthropic
export ANTHROPIC_API_KEY=sk-ant-...
export LLM_PROVIDER=anthropic
```

Without an API key, the chatbot returns article summaries (still useful!).

## Components

### 1. QuickUMLS Mapper (`src/quickumls-mapper.js`)

Maps patient language to medical MeSH terms:

```javascript
import { mapToMeshTerms, processPatientQuery } from './quickumls-mapper.js';

// Simple mapping
const result = await mapToMeshTerms('my hands shake when I\'m nervous');
// → { mappedTerms: [{meshTerm: 'Tremor'}, {meshTerm: 'Anxiety'}], confidence: 0.80 }

// Full pipeline: map + build query
const processed = await processPatientQuery('stomach pain after eating');
// → { mapping: {...}, pubmedQuery: '("Abdominal Pain"[MeSH Terms]...)' }
```

**Supported mappings include:**
- Symptoms: "hands shake" → Tremor, "short of breath" → Dyspnea
- Conditions: "parkinson's" → Parkinson Disease, "diabetes" → Diabetes Mellitus
- Mental health: "anxiety", "depression", "panic attack"
- 70+ common lay terms with automatic MeSH mapping

### 2. LLM Synthesis (`src/llm-synthesis.js`)

Generates patient-friendly answers from PubMed articles:

```javascript
import { synthesizeAnswer } from './llm-synthesis.js';

const result = await synthesizeAnswer(
  'What treatments exist for tremors?',
  articles,  // From PubMed search
  { provider: 'openai', includeDisclaimer: true }
);
// → { answer: "Based on recent research...[PMID: 12345]...", citations: [...], confidence: 0.85 }
```

**Features:**
- 8th grade reading level output
- Inline [PMID: XXXXXXXX] citations
- Confidence scoring
- Medical disclaimers
- Follow-up question support

### 3. PubMed Client (`src/pubmed-client.js`)

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

### 4. MCP Server (`src/mcp-server.js`)

Exposes all functionality via Model Context Protocol:

| Tool | Description |
|------|-------------|
| `search_disease` | Search articles by disease name |
| `search_pubmed` | Run custom PubMed query |
| `get_article` | Fetch article by PMID |
| `build_mesh_query` | Preview generated MeSH query |
| `map_patient_query` | **NEW:** Map plain English → MeSH |
| `patient_search` | **NEW:** Full pipeline (map + search) |
| `answer_question` | **NEW:** Full chatbot (map + search + synthesize) |
| `synthesize_articles` | **NEW:** Synthesize from PMIDs |
| `check_llm_config` | **NEW:** Check LLM API status |

**MCP Config for Claude Desktop:**
```json
{
  "mcpServers": {
    "pubmed": {
      "command": "node",
      "args": ["/path/to/pubmed-medical-chatbot/src/mcp-server.js"],
      "env": {
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

### 5. CLI Search (`src/cli-search.js`)

```bash
# Basic search
node src/cli-search.js "Parkinson's Disease"

# With options
node src/cli-search.js "Type 2 Diabetes" --max 10 --recent 3

# JSON output
node src/cli-search.js "MEN1" --json
```

### 6. Chatbot (`src/chatbot.js`)

```bash
# Interactive mode
node src/chatbot.js

# Piped input
echo "What are the treatments for MEN1?" | node src/chatbot.js

# Use Anthropic
LLM_PROVIDER=anthropic node src/chatbot.js
```

## Architecture

```
┌─────────────────────┐
│   Patient Question  │ "my hands shake when nervous"
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  QuickUMLS Mapper   │ → Tremor, Anxiety [MeSH]
│  (quickumls-mapper) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  MeSH Query Builder │ → "Tremor"[MeSH] OR "Anxiety"[MeSH]
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  PubMed E-utilities │
│  - ESearch (PMIDs)  │
│  - EFetch (details) │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   LLM Synthesis     │ OpenAI / Anthropic
│   (llm-synthesis)   │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Patient Answer     │ + [PMID: 12345] citations
│  + Disclaimer       │ + confidence score
└─────────────────────┘
```

## Testing

```bash
# Test QuickUMLS mapper
npm run test:mapper

# Test LLM synthesis (requires API key)
npm run test:llm

# Run all tests
npm test
```

## API Reference

### `mapToMeshTerms(query, options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `useQuickUMLS` | boolean | false | Use QuickUMLS server if available |
| `minConfidence` | number | 0.3 | Minimum confidence threshold |

### `synthesizeAnswer(question, articles, options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | string | 'openai' | 'openai' or 'anthropic' |
| `model` | string | auto | Model name (provider default) |
| `includeDisclaimer` | boolean | true | Add medical disclaimer |
| `maxArticles` | number | 5 | Max articles for context |
| `temperature` | number | 0.3 | LLM temperature |

### `searchByDisease(disease, options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxResults` | number | 10 | Maximum articles to return |
| `includeAbstracts` | boolean | true | Fetch full abstracts |
| `meshOnly` | boolean | false | Only search MeSH terms |
| `recentYears` | number | null | Limit to last N years |

## Related Projects

- [grll/pubmedmcp](https://github.com/grll/pubmedmcp) - Python MCP server for PubMed (inspired this project)
- [QuickUMLS](https://github.com/Georgetown-IR-Lab/QuickUMLS) - UMLS concept extraction

## Notes

- No API key required for PubMed (but recommended for production)
- Rate limited to 3 requests/second without API key
- LLM API key required for full answer synthesis
- NCBI E-utilities docs: https://www.ncbi.nlm.nih.gov/books/NBK25499/

## License

POC - Internal use only
