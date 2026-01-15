# Security Requirements - PubMed Medical Chatbot

**Issue:** #4 Security Review  
**Assignee:** @hawk  
**Priority:** P1

## Context

This document outlines security requirements for the PubMed Medical Chatbot. This is a medical information product that requires careful attention to data privacy and security.

## Current State

The chatbot consists of:
- `src/quickumls-mapper.js` - Maps patient queries to MeSH terms
- `src/llm-synthesis.js` - Sends queries + PubMed articles to OpenAI/Anthropic
- `src/mcp-server.js` - MCP server exposing tools
- `src/chatbot.js` - Interactive CLI chatbot
- `src/pubmed-client.js` - NCBI E-utilities API client

## Security Review Areas

### 1. Data Privacy (P0)

**Questions to answer:**
- [ ] Are user queries stored? Where?
- [ ] Is there PII detection in queries? (names, dates, specific symptom combinations could identify patients)
- [ ] What data is sent to LLM APIs?
- [ ] Medical data retention policy?

**Current behavior:**
- Queries are NOT persisted to disk by default
- Full queries + PubMed article abstracts are sent to OpenAI/Anthropic
- No PII detection or scrubbing implemented

**Recommendations needed:**
- Should we implement query logging? If so, retention policy?
- PII detection/scrubbing before LLM calls?
- Anonymization strategy?

### 2. API Security (P0)

**Questions to answer:**
- [ ] Rate limiting on PubMed API calls?
- [ ] API key management for NCBI (if using key)?
- [ ] Input sanitization on user queries?
- [ ] Injection vectors?

**Current behavior:**
- No rate limiting (relies on NCBI default limits)
- API keys stored in environment variables
- Basic query sanitization only

**Recommendations needed:**
- Rate limit implementation
- Key rotation strategy
- Enhanced input validation

### 3. LLM Integration (P1)

**Questions to answer:**
- [ ] Prompt injection prevention?
- [ ] Medical advice guardrails?
- [ ] Output filtering for harmful content?
- [ ] Rate limiting on LLM API calls?

**Current implementation:**
- System prompt in `src/llm-synthesis.js`:
  - Instructs not to provide medical advice
  - Requires citations
  - Adds disclaimer
- No explicit prompt injection prevention
- No output filtering

**Areas of concern:**
- User could craft query to extract system prompt
- User could manipulate to get inappropriate medical advice
- No validation of LLM output

### 4. MCP Server (P1)

**Questions to answer:**
- [ ] Authentication for MCP tools?
- [ ] Permission scoping?
- [ ] Audit logging?

**Current behavior:**
- No authentication (trusts MCP client)
- All tools available to any caller
- No audit logging

## Deliverable

Please create `SECURITY.md` in the repo root with:
1. Security assessment findings
2. Risk ratings (Critical/High/Medium/Low)
3. Remediation plan with priorities
4. Recommended security controls

## Files to Review

```
src/
├── quickumls-mapper.js  # Query processing
├── llm-synthesis.js     # LLM API calls (main focus)
├── mcp-server.js        # External exposure
├── chatbot.js           # User input handling
└── pubmed-client.js     # External API calls
```

## Timeline

P1 - Should be completed before production use. Medical product = trust is essential.

---
*Document created by Rex for Hawk coordination*
