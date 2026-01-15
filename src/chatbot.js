#!/usr/bin/env node
/**
 * Medical Chatbot - Patient-Friendly Q&A
 * 
 * Full pipeline chatbot that:
 * 1. Takes natural language patient questions
 * 2. Maps to MeSH terms using QuickUMLS integration
 * 3. Searches PubMed for relevant articles
 * 4. Synthesizes plain English answers using LLM
 * 
 * Usage:
 *   node src/chatbot.js                    # Interactive mode
 *   echo "What causes tremors?" | node src/chatbot.js
 *   PROVIDER=anthropic node src/chatbot.js # Use Anthropic
 */

import { createInterface } from 'readline';
import { processPatientQuery } from './quickumls-mapper.js';
import { searchPubMed, fetchDetails } from './pubmed-client.js';
import { synthesizeAnswer, validateConfig } from './llm-synthesis.js';

/**
 * Main answer function - full pipeline
 */
async function answerQuestion(question, options = {}) {
  const {
    provider = process.env.LLM_PROVIDER || process.env.PROVIDER || 'openai',
    maxArticles = 5,
    verbose = false,
  } = options;

  console.log('\n🔍 Analyzing your question...\n');

  // Step 1: Map patient language to MeSH terms
  if (verbose) console.log('📝 Step 1: Mapping to medical terms...');
  const processed = await processPatientQuery(question);
  
  if (processed.mapping.mappedTerms.length > 0) {
    console.log(`📋 Found relevant medical terms: ${processed.mapping.mappedTerms.slice(0, 3).map(t => t.meshTerm).join(', ')}`);
  } else {
    console.log('📋 Using original query for search');
  }

  // Step 2: Search PubMed
  if (verbose) console.log('\n📚 Step 2: Searching PubMed...');
  console.log('📚 Searching medical literature...\n');
  
  const pmids = await searchPubMed(processed.pubmedQuery, { maxResults: maxArticles });
  
  if (pmids.length === 0) {
    return {
      answer: `I couldn't find any relevant research articles for "${question}". Try rephrasing your question or using different terms.`,
      articles: [],
      mapping: processed.mapping,
    };
  }

  const articles = await fetchDetails(pmids);
  console.log(`Found ${articles.length} relevant article(s)\n`);

  // Step 3: Synthesize answer using LLM
  if (verbose) console.log('🤖 Step 3: Synthesizing answer...');
  
  const llmConfig = validateConfig();
  if (!llmConfig.ready) {
    console.log('⚠️  No LLM API configured. Showing basic summary.\n');
    return buildBasicResponse(question, articles, processed.mapping);
  }

  console.log(`🤖 Generating patient-friendly answer (${provider})...\n`);
  
  const synthesis = await synthesizeAnswer(question, articles, {
    provider,
    includeDisclaimer: true,
    maxArticles,
  });

  return {
    answer: synthesis.answer,
    citations: synthesis.citations,
    confidence: synthesis.confidence,
    mapping: processed.mapping,
    metadata: synthesis.metadata,
  };
}

/**
 * Basic response when LLM is not available
 */
function buildBasicResponse(question, articles, mapping) {
  let answer = `Based on ${articles.length} research article(s):\n\n`;

  // Show key findings from abstracts
  answer += '**Key Research Findings:**\n\n';
  for (const article of articles.slice(0, 3)) {
    if (article.abstract) {
      const firstSentence = article.abstract.split(/\. /)[0];
      answer += `• ${firstSentence}. [PMID: ${article.pmid}]\n\n`;
    }
  }

  // Show sources
  answer += '**Sources:**\n';
  for (const article of articles) {
    answer += `- ${article.title} (${article.journal}, ${article.pubDate})\n`;
    answer += `  ${article.pubmedUrl}\n`;
  }

  answer += '\n⚠️ **Disclaimer:** This information is for educational purposes only. Consult a healthcare provider for medical advice.';

  return {
    answer,
    articles,
    mapping,
    confidence: 0.5,
    metadata: { provider: 'basic' },
  };
}

/**
 * Interactive REPL mode
 */
async function runInteractive() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('\n🏥 Medical Research Chatbot');
  console.log('━'.repeat(50));
  console.log('Ask questions about medical conditions and get');
  console.log('evidence-based answers from PubMed research.\n');
  
  // Show LLM status
  const llmStatus = validateConfig();
  if (llmStatus.ready) {
    console.log(`✅ ${llmStatus.message}\n`);
  } else {
    console.log('⚠️  No LLM API key found. Running in basic mode.');
    console.log('   Set OPENAI_API_KEY or ANTHROPIC_API_KEY for full features.\n');
  }
  
  console.log('Type "quit" to exit, "help" for examples.\n');

  const askQuestion = () => {
    rl.question('You: ', async (input) => {
      const question = input.trim();
      
      if (!question) {
        askQuestion();
        return;
      }
      
      if (question.toLowerCase() === 'quit' || question.toLowerCase() === 'exit') {
        console.log('\nGoodbye! Stay healthy. 👋\n');
        rl.close();
        return;
      }

      if (question.toLowerCase() === 'help') {
        showHelp();
        askQuestion();
        return;
      }

      try {
        const result = await answerQuestion(question);
        console.log('━'.repeat(50));
        console.log('\n📖 Answer:\n');
        console.log(result.answer);
        
        if (result.confidence !== undefined) {
          console.log(`\n📊 Confidence: ${(result.confidence * 100).toFixed(0)}%`);
        }
        
        console.log('\n' + '━'.repeat(50) + '\n');
      } catch (error) {
        console.error(`\n❌ Error: ${error.message}\n`);
      }

      askQuestion();
    });
  };

  askQuestion();
}

function showHelp() {
  console.log(`
📚 Example Questions:
━━━━━━━━━━━━━━━━━━━━
• "What causes Parkinson's disease?"
• "My hands shake when I'm nervous - what could it be?"
• "What are the treatments for type 2 diabetes?"
• "How is breast cancer diagnosed?"
• "What are the symptoms of MEN1?"

💡 Tips:
• Use plain language - I'll translate to medical terms
• Be specific about symptoms or conditions
• Ask about treatments, causes, symptoms, or diagnosis

⚙️ Environment Variables:
• LLM_PROVIDER=openai|anthropic (default: openai)
• OPENAI_API_KEY - for OpenAI synthesis
• ANTHROPIC_API_KEY - for Anthropic synthesis
`);
}

/**
 * Main entry point
 */
async function main() {
  // Check if running interactively or with piped input
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
        
        // Output JSON if requested
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
