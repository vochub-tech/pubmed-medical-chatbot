#!/usr/bin/env node
/**
 * Test LLM Synthesis Layer
 */

import { synthesizeAnswer, validateConfig } from '../src/llm-synthesis.js';
import { searchByDisease } from '../src/pubmed-client.js';

console.log('🧪 Testing LLM Synthesis Layer\n');

async function runTests() {
  // Check configuration
  console.log('📋 Checking LLM Configuration:');
  const config = validateConfig();
  console.log(`   OpenAI: ${config.openai.configured ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`   Anthropic: ${config.anthropic.configured ? '✅ Configured' : '❌ Not configured'}`);
  console.log(`   Status: ${config.message}`);
  console.log();

  if (!config.ready) {
    console.log('⚠️  No LLM API keys configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY to test synthesis.');
    console.log('   Running fallback test only.\n');
  }

  // Fetch some test articles
  console.log('📚 Fetching test articles from PubMed...');
  const results = await searchByDisease('Tremor', {
    maxResults: 3,
    includeAbstracts: true,
    recentYears: 5,
  });
  
  console.log(`   Found ${results.articles.length} articles\n`);

  if (results.articles.length === 0) {
    console.log('❌ No articles found - cannot test synthesis');
    return;
  }

  // Test synthesis
  const question = 'What causes tremors and how are they treated?';
  console.log(`📝 Test Question: "${question}"`);
  console.log('🤖 Running synthesis...\n');

  try {
    const synthesis = await synthesizeAnswer(question, results.articles, {
      includeDisclaimer: true,
    });

    console.log('━'.repeat(60));
    console.log('\n📖 Answer:\n');
    console.log(synthesis.answer);
    console.log('\n' + '━'.repeat(60));
    console.log('\n📊 Metadata:');
    console.log(`   Provider: ${synthesis.metadata.provider}`);
    console.log(`   Articles provided: ${synthesis.metadata.articlesProvided}`);
    console.log(`   Articles cited: ${synthesis.metadata.articlesCited}`);
    console.log(`   Confidence: ${(synthesis.confidence * 100).toFixed(0)}%`);
    
    if (synthesis.citations.length > 0) {
      console.log('\n📚 Citations:');
      for (const cite of synthesis.citations) {
        console.log(`   - [PMID: ${cite.pmid}] ${cite.title.substring(0, 60)}...`);
      }
    }
    
    console.log('\n✅ Synthesis test completed');
  } catch (err) {
    console.log(`❌ Synthesis error: ${err.message}`);
  }
}

runTests().catch(console.error);
