/**
 * QuickUMLS Integration - Plain English to MeSH Term Mapping
 * 
 * Maps natural language patient queries like "my hands shake" to 
 * proper MeSH terms like "Tremor".
 * 
 * Supports:
 * 1. QuickUMLS (if installed and configured) - requires UMLS license
 * 2. NCBI MeSH API fallback - free, no license needed
 * 3. Built-in synonym mapping - common medical terms
 */

const NCBI_MESH_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const MESH_SPELLCHECK_API = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/espell.fcgi';

/**
 * Common medical term mappings (lay terms → MeSH terms)
 * These cover the most common patient expressions
 */
const COMMON_TERM_MAPPINGS = {
  // Movement symptoms
  'hands shake': ['Tremor', 'Essential Tremor'],
  'shaking hands': ['Tremor', 'Essential Tremor'],
  'trembling': ['Tremor'],
  'shaky': ['Tremor'],
  
  // Pain descriptions
  'stomach pain': ['Abdominal Pain'],
  'stomach ache': ['Abdominal Pain'],
  'tummy pain': ['Abdominal Pain'],
  'belly pain': ['Abdominal Pain'],
  'chest pain': ['Chest Pain'],
  'headache': ['Headache', 'Migraine Disorders'],
  'head pain': ['Headache'],
  'back pain': ['Back Pain', 'Low Back Pain'],
  'joint pain': ['Arthralgia'],
  
  // Mental health
  'feeling sad': ['Depression', 'Depressive Disorder'],
  'depression': ['Depressive Disorder', 'Depression'],
  'anxiety': ['Anxiety Disorders', 'Anxiety'],
  'nervous': ['Anxiety', 'Nervousness'],
  'can\'t sleep': ['Sleep Initiation and Maintenance Disorders', 'Insomnia'],
  'insomnia': ['Sleep Initiation and Maintenance Disorders'],
  'panic attack': ['Panic Disorder'],
  
  // Respiratory
  'short of breath': ['Dyspnea'],
  'shortness of breath': ['Dyspnea'],
  'hard to breathe': ['Dyspnea'],
  'breathing difficulty': ['Dyspnea'],
  'cough': ['Cough'],
  'wheezing': ['Respiratory Sounds', 'Wheezing'],
  
  // Cardiovascular
  'heart racing': ['Tachycardia', 'Palpitations'],
  'fast heartbeat': ['Tachycardia'],
  'palpitations': ['Palpitations'],
  'high blood pressure': ['Hypertension'],
  'low blood pressure': ['Hypotension'],
  
  // GI symptoms
  'nausea': ['Nausea'],
  'throwing up': ['Vomiting'],
  'vomiting': ['Vomiting'],
  'diarrhea': ['Diarrhea'],
  'constipation': ['Constipation'],
  'heartburn': ['Heartburn', 'Gastroesophageal Reflux'],
  'acid reflux': ['Gastroesophageal Reflux'],
  
  // Neurological
  'dizzy': ['Dizziness', 'Vertigo'],
  'dizziness': ['Dizziness', 'Vertigo'],
  'numbness': ['Hypesthesia', 'Paresthesia'],
  'tingling': ['Paresthesia'],
  'pins and needles': ['Paresthesia'],
  'memory problems': ['Memory Disorders', 'Cognitive Dysfunction'],
  'forgetfulness': ['Memory Disorders'],
  'seizure': ['Seizures'],
  'convulsion': ['Seizures'],
  
  // Skin
  'rash': ['Exanthema', 'Skin Rash'],
  'itchy skin': ['Pruritus'],
  'itching': ['Pruritus'],
  'hives': ['Urticaria'],
  
  // General
  'fever': ['Fever'],
  'tired': ['Fatigue'],
  'tiredness': ['Fatigue'],
  'fatigue': ['Fatigue'],
  'weakness': ['Muscle Weakness', 'Asthenia'],
  'weight loss': ['Weight Loss'],
  'weight gain': ['Weight Gain'],
  'swelling': ['Edema'],
  
  // Common diseases (lay terms)
  'diabetes': ['Diabetes Mellitus'],
  'sugar diabetes': ['Diabetes Mellitus, Type 2'],
  'cancer': ['Neoplasms'],
  'heart disease': ['Heart Diseases', 'Cardiovascular Diseases'],
  'stroke': ['Stroke'],
  'arthritis': ['Arthritis'],
  'asthma': ['Asthma'],
  'allergies': ['Hypersensitivity'],
  'cold': ['Common Cold'],
  'flu': ['Influenza, Human'],
  'covid': ['COVID-19'],
  'coronavirus': ['COVID-19', 'Coronavirus Infections'],
};

/**
 * MeSH term synonyms for normalization
 */
const MESH_SYNONYMS = {
  'tremor': 'Tremor',
  'essential tremor': 'Essential Tremor',
  'parkinson': 'Parkinson Disease',
  'parkinsons': 'Parkinson Disease',
  "parkinson's": 'Parkinson Disease',
  'alzheimer': 'Alzheimer Disease',
  'alzheimers': 'Alzheimer Disease',
  "alzheimer's": 'Alzheimer Disease',
  'men1': 'Multiple Endocrine Neoplasia Type 1',
  'men 1': 'Multiple Endocrine Neoplasia Type 1',
  'type 1 diabetes': 'Diabetes Mellitus, Type 1',
  'type 2 diabetes': 'Diabetes Mellitus, Type 2',
  't1d': 'Diabetes Mellitus, Type 1',
  't2d': 'Diabetes Mellitus, Type 2',
  'copd': 'Pulmonary Disease, Chronic Obstructive',
  'adhd': 'Attention Deficit Disorder with Hyperactivity',
  'add': 'Attention Deficit Disorder with Hyperactivity',
  'ptsd': 'Stress Disorders, Post-Traumatic',
  'ocd': 'Obsessive-Compulsive Disorder',
  'ibs': 'Irritable Bowel Syndrome',
  'gerd': 'Gastroesophageal Reflux',
  'ra': 'Arthritis, Rheumatoid',
  ' ms ': 'Multiple Sclerosis', // Space-padded to avoid matching in other words
  ' ms': 'Multiple Sclerosis',
  'als': 'Amyotrophic Lateral Sclerosis',
  'hiv': 'HIV Infections',
  'aids': 'Acquired Immunodeficiency Syndrome',
};

/**
 * Main mapping function - converts natural language to MeSH terms
 * @param {string} query - Natural language query from patient
 * @param {object} options - Configuration options
 * @returns {Promise<MappingResult>} Mapped terms with confidence scores
 */
export async function mapToMeshTerms(query, options = {}) {
  const {
    useQuickUMLS = false, // Set true if QuickUMLS is available
    quickUMLSEndpoint = 'http://localhost:5000/match',
    useNCBILookup = true,
    minConfidence = 0.3,
  } = options;

  const results = {
    originalQuery: query,
    mappedTerms: [],
    unmappedPhrases: [],
    confidence: 0,
    method: 'hybrid',
  };

  const normalizedQuery = query.toLowerCase().trim();

  // Step 1: Try QuickUMLS if available
  if (useQuickUMLS) {
    try {
      const quickResults = await queryQuickUMLS(normalizedQuery, quickUMLSEndpoint);
      if (quickResults.length > 0) {
        results.mappedTerms.push(...quickResults);
        results.method = 'quickumls';
      }
    } catch (err) {
      console.warn('QuickUMLS not available, falling back to other methods');
    }
  }

  // Step 2: Apply built-in synonym mapping
  const synonymMatches = matchSynonyms(normalizedQuery);
  for (const match of synonymMatches) {
    // Don't add duplicates
    if (!results.mappedTerms.some(t => t.meshTerm === match.meshTerm)) {
      results.mappedTerms.push(match);
    }
  }

  // Step 3: Apply common term mappings
  const commonMatches = matchCommonTerms(normalizedQuery);
  for (const match of commonMatches) {
    if (!results.mappedTerms.some(t => t.meshTerm === match.meshTerm)) {
      results.mappedTerms.push(match);
    }
  }

  // Step 4: Try NCBI MeSH lookup for any remaining significant phrases
  if (useNCBILookup && results.mappedTerms.length < 3) {
    const ncbiMatches = await lookupNCBIMesh(normalizedQuery);
    for (const match of ncbiMatches) {
      if (!results.mappedTerms.some(t => t.meshTerm === match.meshTerm)) {
        results.mappedTerms.push(match);
      }
    }
  }

  // Step 5: Extract unmapped phrases (for diagnostic purposes)
  results.unmappedPhrases = extractUnmappedPhrases(normalizedQuery, results.mappedTerms);

  // Calculate overall confidence
  if (results.mappedTerms.length > 0) {
    const avgConfidence = results.mappedTerms.reduce((sum, t) => sum + t.confidence, 0) / results.mappedTerms.length;
    results.confidence = avgConfidence;
  }

  // Filter by minimum confidence
  results.mappedTerms = results.mappedTerms.filter(t => t.confidence >= minConfidence);

  // Sort by confidence (highest first)
  results.mappedTerms.sort((a, b) => b.confidence - a.confidence);

  return results;
}

/**
 * Query QuickUMLS endpoint (requires local QuickUMLS server)
 * @param {string} text - Text to match
 * @param {string} endpoint - QuickUMLS server endpoint
 * @returns {Promise<Array>} Matched terms
 */
async function queryQuickUMLS(text, endpoint) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    throw new Error(`QuickUMLS request failed: ${response.status}`);
  }

  const data = await response.json();
  
  // Transform QuickUMLS output to our format
  return (data.matches || []).map(match => ({
    meshTerm: match.preferred_name || match.term,
    cui: match.cui,
    originalPhrase: match.ngram,
    confidence: match.similarity || 0.8,
    source: 'quickumls',
  }));
}

/**
 * Match against built-in synonym list
 * @param {string} query - Normalized query
 * @returns {Array} Matched terms
 */
function matchSynonyms(query) {
  const matches = [];
  
  for (const [synonym, meshTerm] of Object.entries(MESH_SYNONYMS)) {
    if (query.includes(synonym)) {
      matches.push({
        meshTerm,
        originalPhrase: synonym,
        confidence: 0.95, // High confidence for exact synonyms
        source: 'synonym',
      });
    }
  }

  return matches;
}

/**
 * Match against common lay term mappings
 * @param {string} query - Normalized query
 * @returns {Array} Matched terms
 */
function matchCommonTerms(query) {
  const matches = [];
  
  for (const [layTerm, meshTerms] of Object.entries(COMMON_TERM_MAPPINGS)) {
    if (query.includes(layTerm)) {
      // Add all mapped MeSH terms with descending confidence
      meshTerms.forEach((meshTerm, index) => {
        matches.push({
          meshTerm,
          originalPhrase: layTerm,
          confidence: 0.85 - (index * 0.1), // First term gets higher confidence
          source: 'common_mapping',
        });
      });
    }
  }

  return matches;
}

/**
 * Look up terms using NCBI MeSH API
 * @param {string} query - Query text
 * @returns {Promise<Array>} Matched MeSH terms
 */
async function lookupNCBIMesh(query) {
  const matches = [];
  
  try {
    // Use ESearch to find MeSH terms
    const searchUrl = `${NCBI_MESH_API}/esearch.fcgi?db=mesh&term=${encodeURIComponent(query)}&retmode=json&retmax=5`;
    const response = await fetch(searchUrl);
    
    if (!response.ok) return matches;
    
    const data = await response.json();
    const ids = data.esearchresult?.idlist || [];
    
    if (ids.length === 0) return matches;
    
    // Fetch MeSH term details
    const summaryUrl = `${NCBI_MESH_API}/esummary.fcgi?db=mesh&id=${ids.join(',')}&retmode=json`;
    const summaryResponse = await fetch(summaryUrl);
    
    if (!summaryResponse.ok) return matches;
    
    const summaryData = await summaryResponse.json();
    
    for (const id of ids) {
      const term = summaryData.result?.[id];
      if (term?.ds_meshterms?.[0]) {
        matches.push({
          meshTerm: term.ds_meshterms[0],
          meshId: id,
          originalPhrase: query,
          confidence: 0.7, // Moderate confidence for NCBI lookup
          source: 'ncbi_mesh',
        });
      }
    }
  } catch (err) {
    console.warn('NCBI MeSH lookup failed:', err.message);
  }

  return matches;
}

/**
 * Extract phrases that weren't mapped (for diagnostic purposes)
 * @param {string} query - Original query
 * @param {Array} mappedTerms - Terms that were mapped
 * @returns {Array} Unmapped phrases
 */
function extractUnmappedPhrases(query, mappedTerms) {
  let remaining = query;
  
  // Remove mapped phrases
  for (const term of mappedTerms) {
    if (term.originalPhrase) {
      remaining = remaining.replace(term.originalPhrase, ' ');
    }
  }
  
  // Extract remaining significant words (ignore common words)
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'my', 'i', 'me', 
    'when', 'what', 'how', 'why', 'have', 'has', 'had', 'do', 'does', 'did', 'can', 
    'could', 'would', 'should', 'will', 'been', 'being', 'with', 'for', 'at', 'by',
    'about', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to',
    'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further',
    'then', 'once', 'here', 'there', 'all', 'each', 'few', 'more', 'most', 'other',
    'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
    'very', 'just', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of',
    'it', 'this', 'that', 'these', 'those', 'am', 'really', 'get', 'getting', 'got',
    'feel', 'feeling', 'like', 'lot', 'sometimes', 'always', 'often', 'never']);
  
  return remaining
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word))
    .map(word => word.replace(/[.,!?;:'"()]/g, ''));
}

/**
 * Build a PubMed query from mapped MeSH terms
 * @param {MappingResult} mappingResult - Result from mapToMeshTerms
 * @param {object} options - Query options
 * @returns {string} PubMed search query
 */
export function buildQueryFromMapping(mappingResult, options = {}) {
  const {
    includeSubheadings = true,
    dateRange = null,
    maxTerms = 3,
  } = options;

  const terms = mappingResult.mappedTerms.slice(0, maxTerms);
  
  if (terms.length === 0) {
    // Fallback to original query
    return `"${mappingResult.originalQuery}"[Title/Abstract]`;
  }

  // Build MeSH query
  const meshQueries = terms.map(t => `"${t.meshTerm}"[MeSH Terms]`);
  let query = `(${meshQueries.join(' OR ')})`;
  
  // Also search title/abstract for the original query (broaden results)
  query = `(${query} OR "${mappingResult.originalQuery}"[Title/Abstract])`;

  // Add subheadings for medical context
  if (includeSubheadings) {
    const subheadings = ['therapy', 'diagnosis', 'etiology', 'pathophysiology'];
    query = `${query} AND (${subheadings.map(s => `"${s}"[Subheading]`).join(' OR ')})`;
  }

  // Date filter
  if (dateRange) {
    query = `${query} AND ("${dateRange.start}"[Date - Publication] : "${dateRange.end}"[Date - Publication])`;
  }

  return query;
}

/**
 * High-level helper: map and build query in one call
 * @param {string} patientQuery - Natural language patient query
 * @param {object} options - Options for mapping and query building
 * @returns {Promise<object>} Mapping result and generated query
 */
export async function processPatientQuery(patientQuery, options = {}) {
  const mapping = await mapToMeshTerms(patientQuery, options);
  const query = buildQueryFromMapping(mapping, options);
  
  return {
    mapping,
    pubmedQuery: query,
    summary: {
      originalQuery: patientQuery,
      meshTerms: mapping.mappedTerms.map(t => t.meshTerm),
      confidence: mapping.confidence,
      unmapped: mapping.unmappedPhrases,
    },
  };
}

export default {
  mapToMeshTerms,
  buildQueryFromMapping,
  processPatientQuery,
  COMMON_TERM_MAPPINGS,
  MESH_SYNONYMS,
};
