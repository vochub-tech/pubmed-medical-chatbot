# UX Design Requirements - PubMed Medical Chatbot

**Issue:** #5 UX Design  
**Assignee:** @pixel  
**Priority:** P2

## Context

Design a simple, trustworthy interface for patients to ask medical questions and receive evidence-based answers from PubMed research.

## Product Goals

1. Help patients understand medical conditions in plain language
2. Build trust through transparency (citations, disclaimers)
3. Encourage follow-up with healthcare providers

## Current State

- CLI-only chatbot (`node src/chatbot.js`)
- No web interface
- Backend ready for frontend integration

## User Flow

```
┌──────────────────────────────────────────────────────────┐
│  1. Patient enters question in natural language         │
│     "my hands shake when I'm nervous - is this bad?"    │
└───────────────────────────┬──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│  2. System shows processing status                       │
│     "Analyzing question... Searching medical research..." │
└───────────────────────────┬──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│  3. Display answer with citations                        │
│     - Plain English summary                              │
│     - Inline citations [PMID: 12345]                     │
│     - Expandable source details                          │
│     - Confidence indicator                               │
│     - Prominent disclaimer                               │
└───────────────────────────┬──────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────┐
│  4. Enable follow-up questions                           │
│     "What treatments are available?"                     │
└──────────────────────────────────────────────────────────┘
```

## Design Requirements

### Core Interface

- [ ] Clean, medical/trustworthy aesthetic
- [ ] Single text input for questions
- [ ] Clear answer display with citations
- [ ] Prominent disclaimer (always visible)
- [ ] Mobile-responsive design
- [ ] Accessibility: WCAG 2.1 AA compliant

### Trust Signals

- [ ] "Based on X peer-reviewed studies"
- [ ] Clickable citations → PubMed links
- [ ] Confidence indicator (based on article count/relevance)
- [ ] "Not medical advice" disclaimer
- [ ] Source quality indicators (journal impact, recency)

### Answer Display

- [ ] Plain language summary (8th grade reading level)
- [ ] Expandable sections for more detail
- [ ] Citation format: [PMID: 12345678] - clickable
- [ ] Publication metadata on hover/tap
- [ ] "View full article" links

### Loading States

- [ ] "Analyzing your question..."
- [ ] "Searching medical literature..."  
- [ ] "Summarizing research findings..."
- [ ] Progress indicator with steps

### Error States

- [ ] No results found - suggest rephrasing
- [ ] Service unavailable - retry option
- [ ] Unclear question - ask for clarification

## Design Inspirations

Study these for patterns (not copy):
- Drugs.com Q&A format
- Mayo Clinic symptom checker
- ChatGPT medical conversations
- PubMed search results page

## Technical Constraints

- Backend returns JSON with:
  - `answer`: Plain text with [PMID: xxx] citations
  - `citations`: Array of {pmid, title, journal, url}
  - `confidence`: 0-1 score
  - `disclaimer`: Medical disclaimer text
- Mobile + desktop support
- No patient account/login required (MVP)

## Considerations

- Dark/light mode support
- Accessibility (screen readers, keyboard nav)
- i18n-ready (English first, structure for others)
- Loading performance on mobile

## Out of Scope (MVP)

- User accounts/history
- Chat history persistence
- Voice input
- Multi-language

## Deliverable

Design mockups/wireframes for:
1. Main chat interface
2. Answer display with citations
3. Loading/error states
4. Mobile responsive views

## Timeline

P2 - Can iterate post-MVP. Basic usable interface first.

---
*Document created by Rex for Pixel coordination*
