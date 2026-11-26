import type { Citation, KnowledgeDocument } from "./types";

/**
 * Lightweight lexical retrieval. No embeddings, no external service — this
 * runs in a few milliseconds and is good enough for the document sizes the
 * app allows (200k chars per doc, a handful of docs per agent).
 *
 * Scoring is TF-IDF-ish: term frequency in the document, damped by how common
 * the term is across the corpus, normalised by document length so long
 * documents do not win just by being long.
 */

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has",
  "have", "he", "her", "his", "how", "i", "if", "in", "into", "is", "it", "its",
  "me", "my", "no", "not", "of", "on", "or", "our", "she", "so", "that", "the",
  "their", "them", "then", "there", "these", "they", "this", "to", "was", "we",
  "were", "what", "when", "where", "which", "who", "why", "will", "with", "you",
  "your", "can", "do", "does", "did", "about", "would", "should", "could",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^['-]+|['-]+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
  return tf;
}

/** Split a document into overlapping windows so excerpts stay readable. */
export function chunkText(text: string, size = 900, overlap = 120): string[] {
  const clean = text.replace(/\r\n/g, "\n").trim();
  if (clean.length <= size) return clean ? [clean] : [];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(clean.length, start + size);
    if (end < clean.length) {
      // Prefer to break on a paragraph or sentence boundary.
      const window = clean.slice(start, end);
      const boundary = Math.max(window.lastIndexOf("\n\n"), window.lastIndexOf(". "));
      if (boundary > size * 0.5) end = start + boundary + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

export type ScoredChunk = {
  documentId: string;
  title: string;
  score: number;
  text: string;
};

/**
 * Rank document chunks against a query.
 * Returns the top `limit` chunks with a score above `minScore`.
 */
export function retrieve(
  query: string,
  documents: Pick<KnowledgeDocument, "id" | "title" | "content">[],
  limit = 4,
  minScore = 0.01,
): ScoredChunk[] {
  const queryTokens = tokenize(query);
  if (!queryTokens.length || !documents.length) return [];

  // Build the chunk corpus first so IDF is computed over the real corpus.
  const corpus: { documentId: string; title: string; text: string; tokens: string[] }[] = [];
  for (const doc of documents) {
    for (const chunk of chunkText(doc.content)) {
      corpus.push({ documentId: doc.id, title: doc.title, text: chunk, tokens: tokenize(chunk) });
    }
  }
  if (!corpus.length) return [];

  const docFreq = new Map<string, number>();
  for (const entry of corpus) {
    for (const term of new Set(entry.tokens)) {
      docFreq.set(term, (docFreq.get(term) ?? 0) + 1);
    }
  }

  const total = corpus.length;
  const querySet = new Set(queryTokens);

  const scored = corpus.map((entry) => {
    const tf = termFrequency(entry.tokens);
    let score = 0;
    for (const term of querySet) {
      const freq = tf.get(term);
      if (!freq) continue;
      const df = docFreq.get(term) ?? 1;
      const idf = Math.log(1 + total / df);
      // Saturate term frequency so a repeated word cannot dominate.
      score += (freq / (freq + 1.2)) * idf;
    }
    // Length normalisation.
    score = score / Math.sqrt(Math.max(entry.tokens.length, 1) / 100 + 1);
    return { documentId: entry.documentId, title: entry.title, score, text: entry.text };
  });

  return scored
    .filter((s) => s.score > minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** Turn scored chunks into citations with a trimmed excerpt. */
export function toCitations(chunks: ScoredChunk[], excerptLength = 240): Citation[] {
  return chunks.map((chunk) => ({
    documentId: chunk.documentId,
    title: chunk.title,
    score: Number(chunk.score.toFixed(4)),
    excerpt:
      chunk.text.length <= excerptLength
        ? chunk.text
        : chunk.text.slice(0, excerptLength).trimEnd() + "…",
  }));
}
