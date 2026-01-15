# Architecture Design Requirements - Medical Q&A Chatbot

**Issue:** #7 Architecture Design  
**Assignee:** @atlas  
**Priority:** P0

## Context

Design the complete system architecture for a patient-facing medical Q&A chatbot. The current POC works but needs proper architecture for production.

## Current State (POC)

```
src/
├── quickumls-mapper.js   # NEW: Plain English → MeSH mapping
├── llm-synthesis.js      # NEW: LLM answer generation
├── mcp-server.js         # MCP server (enhanced)
├── chatbot.js            # CLI chatbot
├── pubmed-client.js      # PubMed E-utilities client
├── cli-search.js         # CLI search tool
└── index.js              # Exports
```

**Current flow:**
1. Patient query → QuickUMLS Mapper → MeSH terms
2. MeSH terms → PubMed Client → Articles
3. Articles + Question → LLM Synthesis → Answer

**Limitations:**
- No persistence (stateless)
- No user sessions
- Single-process
- No caching
- No monitoring
- CLI-only

## Components to Architect

### 1. Terminology Mapping Layer
**Current:** `quickumls-mapper.js` with built-in synonym map

**Design decisions needed:**
- [ ] Full QuickUMLS integration (requires UMLS license)?
- [ ] Custom MeSH lookup service?
- [ ] Caching strategy for term mappings?
- [ ] Fallback chain (QuickUMLS → NCBI → Built-in)?

### 2. PubMed Integration
**Current:** Direct E-utilities API calls

**Design decisions needed:**
- [ ] Use grll/pubmedmcp as underlying layer?
- [ ] Build our own service?
- [ ] Caching for repeated queries?
- [ ] Rate limiting strategy?
- [ ] Full-text access (PubMed Central)?

### 3. LLM Synthesis Layer
**Current:** Direct OpenAI/Anthropic API calls

**Design decisions needed:**
- [ ] Multi-provider strategy (OpenAI + Anthropic + local)?
- [ ] Prompt versioning/management?
- [ ] Response caching?
- [ ] Fallback chain?
- [ ] Cost management?

### 4. Conversation State
**Current:** Stateless (no follow-up context)

**Design decisions needed:**
- [ ] Session storage (Redis? DB? Memory?)?
- [ ] Context window management?
- [ ] Follow-up question handling?
- [ ] Conversation history?

### 5. API Layer
**Current:** MCP server only

**Design decisions needed:**
- [ ] REST API for web frontend?
- [ ] WebSocket for streaming?
- [ ] Authentication/authorization?
- [ ] Rate limiting per user?

### 6. Deployment
**Current:** Local Node.js process

**Design decisions needed:**
- [ ] Containerization (Docker)?
- [ ] Cloud platform (AWS/GCP/Vercel)?
- [ ] Scaling strategy?
- [ ] CDN for static assets?

## Architecture Questions

### Data Flow
1. How does a query flow through the system?
2. What's cached where and for how long?
3. How do we handle LLM failures gracefully?

### Scalability
1. Expected query volume?
2. Concurrent user handling?
3. LLM API cost at scale?

### Reliability
1. Single points of failure?
2. Fallback strategies?
3. Health checks/monitoring?

### Security
1. Where do we store API keys?
2. How do we isolate user data?
3. Audit logging requirements?

## Deliverable

`ARCHITECTURE.md` with:

### 1. System Diagram
- Component relationships
- Data flow arrows
- External service integrations

### 2. Component Breakdown
For each component:
- Purpose
- Technology choice
- Interfaces (input/output)
- Dependencies
- Scaling considerations

### 3. Data Flow
- Request lifecycle diagram
- Caching layers
- Error handling paths

### 4. API Contracts
- REST endpoints (if applicable)
- MCP tool schemas
- Response formats

### 5. Technology Stack
- Recommended technologies
- Justifications for choices
- Alternatives considered

### 6. Deployment Architecture
- Infrastructure diagram
- Environment configurations
- Secrets management

### 7. Future Considerations
- Phase 2 features
- Scaling path
- Technical debt to address

## Constraints

- **Node.js/TypeScript** - Current stack, prefer to keep
- **MCP compatibility** - Must expose MCP tools
- **LLM flexibility** - Support multiple providers
- **Cost-conscious** - This is a POC, not unlimited budget

## Timeline

P0 - Needed before significant development investment.

---
*Document created by Rex for Atlas coordination*
