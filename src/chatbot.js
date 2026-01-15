#!/usr/bin/env node
/**
 * Medical Chatbot POC
 * 
 * Simple chatbot that:
 * 1. Takes a user question about a disease
 * 2. Searches PubMed for relevant articles
 * 3. Uses an LLM to synthesize an answer from the articles
 * 
 * Usage:
 *   node src/chatbot.js
 *   echo "What are the treatments for MEN1?" | node src/chatbot.js
 */

import { searchByDisease } from './pubmed-client.js';
import { createInterface } from 'readline';

// Simple disease name extraction from questions
function extractDiseaseName(question) {
  // Common patterns for disease questions
  const patterns = [
    /what (?:are|is) (?:the )?(?:treatment|cause|symptom|diagnosis|prognosis).* (?:for|of) (.+?)\??$/i,
    /how (?:to |do you )?(?:treat|diagnose|prevent) (.+?)\??$/i,
    /tell me about (.+?)(?:'s| treatment| symptoms| causes)?\??$/i,
    /(?:treatment|causes?|symptoms?) (?:of|for) (.+?)\??$/i,
    /what (?:causes?|is) (.+?)\??$/i,
    /(.+?) (?:treatment|symptoms|causes|diagnosis)\??$/i,
  ];

  for (const pattern of patterns) {
    const match = question.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // Fallback: use the whole question as the search term
  return question.replace(/\?/g, '').trim();
}

// Format articles for context
function formatArticlesForContext(articles) {
  return articles.map((article, i) => `
[Article ${i + 1}]
Title: ${article.title}
Authors: ${article.authors?.slice(0, 3).join(', ') || 'N/A'}
Journal: ${article.journal} (${article.pubDate})
PMID: ${article.pmid}
MeSH Terms: ${article.meshTerms?.slice(0, 5).join(', ') || 'N/A'}

Abstract:
${article.abstract || 'No abstract available'}
`).join('\n---\n');
}

// Generate a prompt for the LLM
function generatePrompt(question, articles) {
  const context = formatArticlesForContext(articles);
  
  return `You are a medical information assistant. Based on the following PubMed articles, answer the user's question. 

Important guidelines:
- Only provide information that is supported by the articles below
- Cite the relevant PMID when making claims
- If the articles don't contain relevant information, say so
- Include a disclaimer that this is for informational purposes only
- Be accurate and cite sources

ARTICLES FROM PUBMED:
${context}

USER QUESTION: ${question}

Please provide a helpful, evidence-based response:`;
}

// Main chatbot function
async function answerQuestion(question) {
  console.log('\n🔍 Analyzing question...\n');
  
  // Extract disease name from question
  const disease = extractDiseaseName(question);
  console.log(`📋 Detected topic: "${disease}"`);
  
  // Search PubMed
  console.log('📚 Searching PubMed...\n');
  const results = await searchByDisease(disease, {
    maxResults: 5,
    includeAbstracts: true,
    recentYears: 5, // Focus on recent research
  });

  if (results.articles.length === 0) {
    return {
      answer: `I couldn't find any recent PubMed articles about "${disease}". Please try rephrasing your question or using a different disease name.`,
      sources: [],
      query: results.query,
    };
  }

  console.log(`Found ${results.articles.length} relevant articles\n`);

  // Generate the LLM prompt
  const prompt = generatePrompt(question, results.articles);
  
  // For the POC, we'll output the prompt and articles
  // In production, this would call an LLM API
  const synthesizedAnswer = synthesizeBasicAnswer(question, results.articles);

  return {
    answer: synthesizedAnswer,
    sources: results.articles.map(a => ({
      title: a.title,
      pmid: a.pmid,
      url: a.pubmedUrl,
      journal: a.journal,
    })),
    query: results.query,
    llmPrompt: prompt, // For integration with actual LLM
  };
}

// Basic answer synthesis (without LLM - for POC demo)
function synthesizeBasicAnswer(question, articles) {
  const topArticle = articles[0];
  
  let answer = `Based on ${articles.length} recent PubMed articles about this topic:\n\n`;
  
  // Summarize key points from abstracts
  answer += `**Key Research Findings:**\n\n`;
  
  for (const article of articles.slice(0, 3)) {
    if (article.abstract) {
      // Extract first 1-2 sentences from abstract
      const sentences = article.abstract.split(/\. /).slice(0, 2).join('. ');
      answer += `• ${sentences}. (PMID: ${article.pmid})\n\n`;
    }
  }
  
  answer += `\n**Sources:**\n`;
  for (const article of articles) {
    answer += `- ${article.title} (${article.journal}, ${article.pubDate}) - ${article.pubmedUrl}\n`;
  }
  
  answer += `\n⚠️ **Disclaimer:** This information is from research articles for educational purposes only. Consult a healthcare provider for medical advice.`;
  
  return answer;
}

// Interactive REPL mode
async function runInteractive() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n🏥 Medical Chatbot POC');
  console.log('Ask questions about diseases and get answers based on PubMed research.');
  console.log('Type "quit" to exit.\n');

  const askQuestion = () => {
    rl.question('You: ', async (input) => {
      const question = input.trim();
      
      if (!question) {
        askQuestion();
        return;
      }
      
      if (question.toLowerCase() === 'quit' || question.toLowerCase() === 'exit') {
        console.log('\nGoodbye!');
        rl.close();
        return;
      }

      try {
        const result = await answerQuestion(question);
        console.log('\n📖 Answer:\n');
        console.log(result.answer);
        console.log('\n' + '─'.repeat(60) + '\n');
      } catch (error) {
        console.error(`\nError: ${error.message}\n`);
      }

      askQuestion();
    });
  };

  askQuestion();
}

// Check if running from pipe or interactive
async function main() {
  // Check if stdin is a TTY (interactive) or piped
  if (process.stdin.isTTY) {
    await runInteractive();
  } else {
    // Read from stdin (piped input)
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
    }
    
    const question = input.trim();
    if (question) {
      try {
        const result = await answerQuestion(question);
        console.log('\n📖 Answer:\n');
        console.log(result.answer);
        
        // Also output JSON for programmatic use
        if (process.env.JSON_OUTPUT) {
          console.log('\n---JSON---\n');
          console.log(JSON.stringify(result, null, 2));
        }
      } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
      }
    }
  }
}

main();
