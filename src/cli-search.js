#!/usr/bin/env node
/**
 * CLI tool for testing PubMed search
 * 
 * Usage:
 *   node src/cli-search.js "Multiple Endocrine Neoplasia Type 1"
 *   node src/cli-search.js "Diabetes Mellitus" --max 5 --recent 2
 */

import { searchByDisease } from './pubmed-client.js';

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
PubMed Disease Search CLI

Usage:
  node src/cli-search.js <disease> [options]

Options:
  --max <n>      Maximum results (default: 5)
  --recent <n>   Only articles from last N years
  --no-abstract  Skip fetching abstracts (faster)
  --json         Output raw JSON

Examples:
  node src/cli-search.js "Breast Cancer"
  node src/cli-search.js "Multiple Endocrine Neoplasia Type 1" --max 3 --recent 5
  node src/cli-search.js "Diabetes" --json
`);
    process.exit(0);
  }

  // Parse arguments
  const disease = args.find(a => !a.startsWith('--')) || '';
  const maxResults = parseInt(args[args.indexOf('--max') + 1]) || 5;
  const recentYears = args.includes('--recent') 
    ? parseInt(args[args.indexOf('--recent') + 1]) 
    : null;
  const includeAbstracts = !args.includes('--no-abstract');
  const jsonOutput = args.includes('--json');

  if (!disease) {
    console.error('Error: Please provide a disease name');
    process.exit(1);
  }

  console.error(`\nSearching PubMed for: "${disease}"...\n`);

  try {
    const results = await searchByDisease(disease, {
      maxResults,
      recentYears,
      includeAbstracts,
    });

    if (jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    // Pretty print results
    console.log(`Query: ${results.query}\n`);
    console.log(`Found ${results.totalResults} articles:\n`);
    console.log('─'.repeat(80));

    for (const article of results.articles) {
      console.log(`\n📄 ${article.title}`);
      console.log(`   PMID: ${article.pmid}`);
      console.log(`   Authors: ${article.authors?.slice(0, 3).join(', ') || 'N/A'}${article.authors?.length > 3 ? ' et al.' : ''}`);
      console.log(`   Journal: ${article.journal} (${article.pubDate})`);
      console.log(`   URL: ${article.pubmedUrl}`);
      
      if (article.meshTerms?.length) {
        console.log(`   MeSH: ${article.meshTerms.slice(0, 5).join(', ')}${article.meshTerms.length > 5 ? '...' : ''}`);
      }
      
      if (article.abstract) {
        const truncatedAbstract = article.abstract.length > 300 
          ? article.abstract.substring(0, 300) + '...'
          : article.abstract;
        console.log(`\n   Abstract: ${truncatedAbstract}`);
      }
      
      console.log('\n' + '─'.repeat(80));
    }

  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
