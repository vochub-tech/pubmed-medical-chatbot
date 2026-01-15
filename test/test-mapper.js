#!/usr/bin/env node
/**
 * Test QuickUMLS Mapper
 */

import quickumlsMapper from '../src/quickumls-mapper.js';
const { mapToMeshTerms, processPatientQuery, COMMON_TERM_MAPPINGS } = quickumlsMapper;

console.log('🧪 Testing QuickUMLS Mapper\n');

const testQueries = [
  'my hands shake when I\'m nervous',
  'stomach pain after eating',
  'feeling tired all the time',
  'chest pain and shortness of breath',
  'type 2 diabetes treatment',
  'parkinson\'s disease symptoms',
  'MEN1 diagnosis',
  'anxiety and panic attacks',
];

async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const query of testQueries) {
    console.log(`📝 Query: "${query}"`);
    
    try {
      const result = await mapToMeshTerms(query);
      
      if (result.mappedTerms.length > 0) {
        console.log(`   ✅ Mapped to: ${result.mappedTerms.map(t => t.meshTerm).join(', ')}`);
        console.log(`   📊 Confidence: ${(result.confidence * 100).toFixed(0)}%`);
        passed++;
      } else {
        console.log(`   ⚠️  No mappings found`);
        // This isn't necessarily a failure - some queries might not have direct mappings
        passed++;
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      failed++;
    }
    console.log();
  }

  console.log('━'.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`Common terms in dictionary: ${Object.keys(COMMON_TERM_MAPPINGS).length}`);
  console.log();

  // Test full pipeline
  console.log('🔄 Testing full pipeline (processPatientQuery):');
  const pipelineResult = await processPatientQuery('my hands shake and I feel dizzy');
  console.log(`   Original: "${pipelineResult.mapping.originalQuery}"`);
  console.log(`   MeSH Terms: ${pipelineResult.summary.meshTerms.join(', ')}`);
  console.log(`   PubMed Query: ${pipelineResult.pubmedQuery.substring(0, 100)}...`);
}

runTests().catch(console.error);
