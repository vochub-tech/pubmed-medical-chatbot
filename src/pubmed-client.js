/**
 * PubMed E-utilities Client
 * 
 * Uses NCBI E-utilities API for programmatic access to PubMed
 * API Docs: https://www.ncbi.nlm.nih.gov/books/NBK25499/
 */

const BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';

/**
 * Search PubMed using a query string
 * @param {string} query - Search query (can use MeSH terms)
 * @param {object} options - Search options
 * @returns {Promise<string[]>} Array of PMIDs
 */
export async function searchPubMed(query, options = {}) {
  const {
    maxResults = 10,
    sort = 'relevance', // relevance, date
    minDate = null,
    maxDate = null,
  } = options;

  const params = new URLSearchParams({
    db: 'pubmed',
    term: query,
    retmode: 'json',
    retmax: maxResults.toString(),
    sort: sort,
  });

  if (minDate) params.append('mindate', minDate);
  if (maxDate) params.append('maxdate', maxDate);

  const url = `${BASE_URL}/esearch.fcgi?${params}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PubMed search failed: ${response.status}`);
  }

  const data = await response.json();
  return data.esearchresult?.idlist || [];
}

/**
 * Fetch article summaries for given PMIDs
 * @param {string[]} pmids - Array of PubMed IDs
 * @returns {Promise<object[]>} Array of article summaries
 */
export async function fetchSummaries(pmids) {
  if (!pmids.length) return [];

  const params = new URLSearchParams({
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'json',
  });

  const url = `${BASE_URL}/esummary.fcgi?${params}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PubMed summary fetch failed: ${response.status}`);
  }

  const data = await response.json();
  const result = data.result || {};
  
  return pmids.map(pmid => {
    const article = result[pmid];
    if (!article) return null;
    
    return {
      pmid,
      title: article.title || '',
      authors: (article.authors || []).map(a => a.name).join(', '),
      journal: article.fulljournalname || article.source || '',
      pubDate: article.pubdate || '',
      doi: extractDoi(article.articleids || []),
      pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    };
  }).filter(Boolean);
}

/**
 * Fetch full article details including abstract
 * @param {string[]} pmids - Array of PubMed IDs
 * @returns {Promise<object[]>} Array of article details with abstracts
 */
export async function fetchDetails(pmids) {
  if (!pmids.length) return [];

  const params = new URLSearchParams({
    db: 'pubmed',
    id: pmids.join(','),
    retmode: 'xml',
    rettype: 'abstract',
  });

  const url = `${BASE_URL}/efetch.fcgi?${params}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`PubMed fetch failed: ${response.status}`);
  }

  const xml = await response.text();
  return parseArticlesXml(xml);
}

/**
 * Build a MeSH query for a disease
 * @param {string} disease - Disease name
 * @param {object} options - Query options
 * @returns {string} Formatted MeSH query
 */
export function buildDiseaseQuery(disease, options = {}) {
  const {
    meshOnly = false,
    includeSubheadings = true,
    dateRange = null,
    articleTypes = [],
  } = options;

  let query = '';

  // Try MeSH term first, fall back to text search
  if (meshOnly) {
    query = `"${disease}"[MeSH Terms]`;
  } else {
    // Search both MeSH and title/abstract for broader coverage
    query = `("${disease}"[MeSH Terms] OR "${disease}"[Title/Abstract])`;
  }

  // Add subheadings for better disease context
  if (includeSubheadings) {
    const subheadings = [
      'therapy',
      'diagnosis', 
      'etiology',
      'pathophysiology',
    ];
    // MeSH subheading qualifiers
    query = `${query} AND (${subheadings.map(s => `"${s}"[Subheading]`).join(' OR ')})`;
  }

  // Filter by article type
  if (articleTypes.length) {
    const typeFilter = articleTypes.map(t => `"${t}"[Publication Type]`).join(' OR ');
    query = `${query} AND (${typeFilter})`;
  }

  // Date filter
  if (dateRange) {
    query = `${query} AND ("${dateRange.start}"[Date - Publication] : "${dateRange.end}"[Date - Publication])`;
  }

  return query;
}

/**
 * Search PubMed for disease-related articles
 * @param {string} disease - Disease name
 * @param {object} options - Search options
 * @returns {Promise<object>} Search results with articles
 */
export async function searchByDisease(disease, options = {}) {
  const {
    maxResults = 10,
    includeAbstracts = true,
    meshOnly = false,
    recentYears = null,
  } = options;

  // Build the query
  const queryOptions = { meshOnly };
  if (recentYears) {
    const now = new Date();
    const startYear = now.getFullYear() - recentYears;
    queryOptions.dateRange = {
      start: `${startYear}/01/01`,
      end: `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`,
    };
  }

  const query = buildDiseaseQuery(disease, queryOptions);
  
  // Search for PMIDs
  const pmids = await searchPubMed(query, { maxResults });
  
  if (!pmids.length) {
    return {
      disease,
      query,
      totalResults: 0,
      articles: [],
    };
  }

  // Fetch article details
  let articles;
  if (includeAbstracts) {
    articles = await fetchDetails(pmids);
  } else {
    articles = await fetchSummaries(pmids);
  }

  return {
    disease,
    query,
    totalResults: pmids.length,
    articles,
  };
}

// Helper: Extract DOI from article IDs
function extractDoi(articleIds) {
  const doiEntry = articleIds.find(id => id.idtype === 'doi');
  return doiEntry ? doiEntry.value : null;
}

// Helper: Parse PubMed XML response
function parseArticlesXml(xml) {
  const articles = [];
  
  // Simple regex-based parsing (for POC - production should use proper XML parser)
  const articleMatches = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];
  
  for (const articleXml of articleMatches) {
    const pmid = extractTag(articleXml, 'PMID');
    const title = extractTag(articleXml, 'ArticleTitle');
    const abstractText = extractAbstract(articleXml);
    const journal = extractTag(articleXml, 'Title'); // Journal title
    const pubDate = extractPubDate(articleXml);
    const authors = extractAuthors(articleXml);
    const meshTerms = extractMeshTerms(articleXml);
    const doi = extractDoiFromXml(articleXml);

    articles.push({
      pmid,
      title: cleanText(title),
      abstract: cleanText(abstractText),
      authors,
      journal: cleanText(journal),
      pubDate,
      doi,
      meshTerms,
      pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    });
  }

  return articles;
}

function extractTag(xml, tagName) {
  const match = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`));
  return match ? match[1] : '';
}

function extractAbstract(xml) {
  // Handle structured abstracts with multiple AbstractText elements
  const abstractTexts = xml.match(/<AbstractText[^>]*>[\s\S]*?<\/AbstractText>/g) || [];
  if (abstractTexts.length) {
    return abstractTexts.map(at => {
      const labelMatch = at.match(/Label="([^"]+)"/);
      const textMatch = at.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
      const label = labelMatch ? labelMatch[1] : '';
      const text = textMatch ? textMatch[1] : '';
      return label ? `${label}: ${text}` : text;
    }).join(' ');
  }
  return '';
}

function extractPubDate(xml) {
  const pubDateMatch = xml.match(/<PubDate>([\s\S]*?)<\/PubDate>/);
  if (!pubDateMatch) return '';
  
  const year = extractTag(pubDateMatch[1], 'Year');
  const month = extractTag(pubDateMatch[1], 'Month');
  const day = extractTag(pubDateMatch[1], 'Day');
  
  return [year, month, day].filter(Boolean).join(' ');
}

function extractAuthors(xml) {
  const authorList = xml.match(/<AuthorList[^>]*>([\s\S]*?)<\/AuthorList>/);
  if (!authorList) return [];
  
  const authors = authorList[1].match(/<Author[^>]*>[\s\S]*?<\/Author>/g) || [];
  return authors.map(author => {
    const lastName = extractTag(author, 'LastName');
    const foreName = extractTag(author, 'ForeName');
    return [lastName, foreName].filter(Boolean).join(' ');
  }).slice(0, 5); // Limit to first 5 authors
}

function extractMeshTerms(xml) {
  const meshList = xml.match(/<MeshHeadingList>([\s\S]*?)<\/MeshHeadingList>/);
  if (!meshList) return [];
  
  const descriptors = meshList[1].match(/<DescriptorName[^>]*>[\s\S]*?<\/DescriptorName>/g) || [];
  return descriptors.map(d => {
    const match = d.match(/<DescriptorName[^>]*>([\s\S]*?)<\/DescriptorName>/);
    return match ? cleanText(match[1]) : '';
  }).filter(Boolean);
}

function extractDoiFromXml(xml) {
  const doiMatch = xml.match(/<ArticleId IdType="doi">([^<]+)<\/ArticleId>/);
  return doiMatch ? doiMatch[1] : null;
}

function cleanText(text) {
  return text
    .replace(/<[^>]+>/g, '') // Remove any remaining HTML tags
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
}

export default {
  searchPubMed,
  fetchSummaries,
  fetchDetails,
  buildDiseaseQuery,
  searchByDisease,
};
