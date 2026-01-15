/**
 * LLM Synthesis Layer - Generate Plain English Answers from PubMed Articles
 * 
 * Connects to OpenAI or Anthropic to synthesize patient-friendly answers
 * from medical research, with inline citations and disclaimers.
 */

/**
 * @typedef {Object} Article
 * @property {string} pmid - PubMed ID
 * @property {string} title - Article title
 * @property {string} abstract - Article abstract
 * @property {string[]} authors - Author list
 * @property {string} journal - Journal name
 * @property {string} pubDate - Publication date
 * @property {string[]} meshTerms - MeSH terms
 */

/**
 * @typedef {Object} SynthesisResult
 * @property {string} answer - Plain English answer with citations
 * @property {string} disclaimer - Medical disclaimer
 * @property {Object[]} citations - Cited articles
 * @property {number} confidence - Answer confidence (0-1)
 * @property {Object} metadata - Processing metadata
 */

// Default system prompt for medical synthesis
const MEDICAL_SYSTEM_PROMPT = `You are a medical information assistant that helps patients understand research findings. 

Your responsibilities:
1. Synthesize information from PubMed research articles into clear, patient-friendly language
2. Use an 8th grade reading level - avoid medical jargon when possible
3. Always cite your sources using [PMID: XXXXXXXX] format inline
4. Acknowledge uncertainty with phrases like "According to research..." or "Studies suggest..."
5. Never provide specific medical advice, diagnoses, or treatment recommendations
6. If the articles don't contain relevant information, clearly state this

Key guidelines:
- Be accurate and evidence-based
- Prioritize the most relevant and recent findings
- Explain medical terms when you must use them
- Present balanced information (benefits AND risks)
- Keep responses concise but informative (2-4 paragraphs typically)`;

const MEDICAL_DISCLAIMER = `

⚠️ **Important Disclaimer:** This information is for educational purposes only and is not medical advice. The content is based on research articles and may not apply to your specific situation. Always consult a qualified healthcare provider for personal medical questions, diagnoses, or treatment decisions.`;

/**
 * Main synthesis function - generates patient-friendly answer from articles
 * @param {string} question - Patient's original question
 * @param {Article[]} articles - PubMed articles to synthesize
 * @param {object} options - Configuration options
 * @returns {Promise<SynthesisResult>} Synthesized answer
 */
export async function synthesizeAnswer(question, articles, options = {}) {
  const {
    provider = process.env.LLM_PROVIDER || 'openai', // 'openai' or 'anthropic'
    model = null, // Let provider decide default
    apiKey = null, // Falls back to env vars
    includeDisclaimer = true,
    maxArticles = 5,
    temperature = 0.3, // Lower for more factual responses
  } = options;

  // Validate inputs
  if (!articles || articles.length === 0) {
    return {
      answer: "I couldn't find any relevant research articles for your question. Please try rephrasing or being more specific about the medical topic you're asking about.",
      disclaimer: includeDisclaimer ? MEDICAL_DISCLAIMER : '',
      citations: [],
      confidence: 0,
      metadata: { articlesUsed: 0, provider: 'none' },
    };
  }

  // Limit articles to prevent context overflow
  const selectedArticles = articles.slice(0, maxArticles);
  
  // Format articles for context
  const context = formatArticlesForLLM(selectedArticles);
  
  // Build the user prompt
  const userPrompt = buildUserPrompt(question, context);

  // Call appropriate LLM
  let llmResponse;
  try {
    if (provider === 'anthropic') {
      llmResponse = await callAnthropic(userPrompt, { model, apiKey, temperature });
    } else {
      llmResponse = await callOpenAI(userPrompt, { model, apiKey, temperature });
    }
  } catch (err) {
    console.error('LLM API error:', err.message);
    // Return fallback response
    return buildFallbackResponse(question, selectedArticles, includeDisclaimer, err.message);
  }

  // Parse and enhance the response
  const answer = llmResponse.content || llmResponse;
  
  // Extract which PMIDs were actually cited
  const citedPmids = extractCitedPmids(answer);
  const citedArticles = selectedArticles.filter(a => citedPmids.includes(a.pmid));

  // Calculate confidence based on various factors
  const confidence = calculateConfidence(selectedArticles, citedPmids, answer);

  return {
    answer: answer + (includeDisclaimer ? MEDICAL_DISCLAIMER : ''),
    disclaimer: MEDICAL_DISCLAIMER,
    citations: citedArticles.map(a => ({
      pmid: a.pmid,
      title: a.title,
      journal: a.journal,
      pubDate: a.pubDate,
      url: `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`,
    })),
    confidence,
    metadata: {
      articlesProvided: selectedArticles.length,
      articlesCited: citedPmids.length,
      provider,
      model: llmResponse.model || model,
      tokensUsed: llmResponse.usage || null,
    },
  };
}

/**
 * Format articles into context string for LLM
 */
function formatArticlesForLLM(articles) {
  return articles.map((article, i) => `
---
ARTICLE ${i + 1}
PMID: ${article.pmid}
Title: ${article.title}
Authors: ${(article.authors || []).slice(0, 3).join(', ')}${(article.authors || []).length > 3 ? ' et al.' : ''}
Journal: ${article.journal} (${article.pubDate || 'Date unknown'})
MeSH Terms: ${(article.meshTerms || []).slice(0, 5).join(', ') || 'N/A'}

Abstract:
${article.abstract || 'No abstract available'}
---`).join('\n');
}

/**
 * Build the user prompt for the LLM
 */
function buildUserPrompt(question, articleContext) {
  return `Based on the following PubMed research articles, please answer this patient's question in plain, easy-to-understand language.

PATIENT QUESTION: "${question}"

RESEARCH ARTICLES:
${articleContext}

Please provide a helpful, evidence-based response that:
1. Directly addresses the patient's question
2. Uses simple language (8th grade reading level)
3. Cites relevant articles using [PMID: XXXXXXXX] format
4. Acknowledges any limitations or uncertainties in the research
5. Does not provide specific medical advice

Your response:`;
}

/**
 * Call OpenAI API
 */
async function callOpenAI(userPrompt, options = {}) {
  const {
    model = 'gpt-4o-mini',
    apiKey = process.env.OPENAI_API_KEY,
    temperature = 0.3,
  } = options;

  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: MEDICAL_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  
  return {
    content: data.choices?.[0]?.message?.content || '',
    model: data.model,
    usage: data.usage,
  };
}

/**
 * Call Anthropic API
 */
async function callAnthropic(userPrompt, options = {}) {
  const {
    model = 'claude-3-5-haiku-20241022',
    apiKey = process.env.ANTHROPIC_API_KEY,
    temperature = 0.3,
  } = options;

  if (!apiKey) {
    throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: MEDICAL_SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      temperature,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error: ${response.status} - ${errorBody}`);
  }

  const data = await response.json();
  
  return {
    content: data.content?.[0]?.text || '',
    model: data.model,
    usage: data.usage,
  };
}

/**
 * Extract PMIDs cited in the answer
 */
function extractCitedPmids(answer) {
  const pmidPattern = /\[PMID:\s*(\d+)\]/gi;
  const matches = [...answer.matchAll(pmidPattern)];
  return [...new Set(matches.map(m => m[1]))];
}

/**
 * Calculate confidence score for the answer
 */
function calculateConfidence(articles, citedPmids, answer) {
  let confidence = 0;

  // Base confidence from having articles
  if (articles.length > 0) confidence += 0.2;
  if (articles.length >= 3) confidence += 0.1;
  if (articles.length >= 5) confidence += 0.1;

  // Confidence from citations
  const citationRate = citedPmids.length / articles.length;
  confidence += citationRate * 0.3;

  // Confidence from answer quality indicators
  if (answer.includes('[PMID:')) confidence += 0.1;
  if (answer.length > 200) confidence += 0.1;
  if (!answer.toLowerCase().includes("i couldn't find") && 
      !answer.toLowerCase().includes("no relevant")) {
    confidence += 0.1;
  }

  return Math.min(confidence, 1); // Cap at 1.0
}

/**
 * Build fallback response when LLM fails
 */
function buildFallbackResponse(question, articles, includeDisclaimer, errorMessage) {
  let answer = `Based on ${articles.length} research article(s) about your question:\n\n`;
  
  // Simple extractive summary
  for (const article of articles.slice(0, 3)) {
    if (article.abstract) {
      const firstSentence = article.abstract.split(/\. /)[0];
      answer += `• ${firstSentence}. [PMID: ${article.pmid}]\n\n`;
    }
  }

  answer += `\n**Note:** I was unable to fully synthesize this information due to a technical issue (${errorMessage}). Please review the source articles for complete details.`;

  return {
    answer: answer + (includeDisclaimer ? MEDICAL_DISCLAIMER : ''),
    disclaimer: MEDICAL_DISCLAIMER,
    citations: articles.slice(0, 3).map(a => ({
      pmid: a.pmid,
      title: a.title,
      journal: a.journal,
      pubDate: a.pubDate,
      url: `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`,
    })),
    confidence: 0.3,
    metadata: {
      articlesProvided: articles.length,
      articlesCited: Math.min(3, articles.length),
      provider: 'fallback',
      error: errorMessage,
    },
  };
}

/**
 * Handle follow-up questions with conversation context
 * @param {string} followUpQuestion - The follow-up question
 * @param {Object} previousContext - Previous question/answer context
 * @param {Article[]} articles - Articles (can reuse or fetch new)
 * @param {Object} options - Synthesis options
 * @returns {Promise<SynthesisResult>}
 */
export async function synthesizeFollowUp(followUpQuestion, previousContext, articles, options = {}) {
  const {
    provider = process.env.LLM_PROVIDER || 'openai',
    model = null,
    apiKey = null,
    includeDisclaimer = true,
    temperature = 0.3,
  } = options;

  const context = formatArticlesForLLM(articles);
  
  const userPrompt = `This is a follow-up question to a previous conversation.

PREVIOUS QUESTION: "${previousContext.question}"
PREVIOUS ANSWER SUMMARY: ${previousContext.answer?.substring(0, 500)}...

FOLLOW-UP QUESTION: "${followUpQuestion}"

RESEARCH ARTICLES:
${context}

Please answer the follow-up question, building on the previous context. Use [PMID: XXXXXXXX] citations and plain language.

Your response:`;

  let llmResponse;
  try {
    if (provider === 'anthropic') {
      llmResponse = await callAnthropic(userPrompt, { model, apiKey, temperature });
    } else {
      llmResponse = await callOpenAI(userPrompt, { model, apiKey, temperature });
    }
  } catch (err) {
    return buildFallbackResponse(followUpQuestion, articles, includeDisclaimer, err.message);
  }

  const answer = llmResponse.content || llmResponse;
  const citedPmids = extractCitedPmids(answer);
  const citedArticles = articles.filter(a => citedPmids.includes(a.pmid));

  return {
    answer: answer + (includeDisclaimer ? MEDICAL_DISCLAIMER : ''),
    disclaimer: MEDICAL_DISCLAIMER,
    citations: citedArticles.map(a => ({
      pmid: a.pmid,
      title: a.title,
      journal: a.journal,
      pubDate: a.pubDate,
      url: `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}/`,
    })),
    confidence: calculateConfidence(articles, citedPmids, answer),
    metadata: {
      articlesProvided: articles.length,
      articlesCited: citedPmids.length,
      provider,
      model: llmResponse.model || model,
      isFollowUp: true,
    },
  };
}

/**
 * Validate LLM configuration
 * @returns {Object} Configuration status
 */
export function validateConfig() {
  const status = {
    openai: {
      configured: !!process.env.OPENAI_API_KEY,
      keyPrefix: process.env.OPENAI_API_KEY?.substring(0, 7) || null,
    },
    anthropic: {
      configured: !!process.env.ANTHROPIC_API_KEY,
      keyPrefix: process.env.ANTHROPIC_API_KEY?.substring(0, 7) || null,
    },
    defaultProvider: process.env.LLM_PROVIDER || 'openai',
  };

  status.ready = status.openai.configured || status.anthropic.configured;
  status.message = status.ready 
    ? `LLM ready: ${status.openai.configured ? 'OpenAI' : ''}${status.openai.configured && status.anthropic.configured ? ' + ' : ''}${status.anthropic.configured ? 'Anthropic' : ''}`
    : 'No LLM API keys configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.';

  return status;
}

export default {
  synthesizeAnswer,
  synthesizeFollowUp,
  validateConfig,
  MEDICAL_DISCLAIMER,
};
