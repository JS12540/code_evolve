import { ProjectFile } from '../types';

// Simple Tokenizer for code
const tokenize = (text: string): string[] => {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, ' ') // Replace non-alphanumeric with space
    .split(/\s+/)
    .filter(t => t.length > 2 && !['import', 'from', 'def', 'class', 'return', 'self'].includes(t));
};

interface DocumentVector {
  path: string;
  vector: Map<string, number>;
  magnitude: number;
}

class VectorIndex {
  private documents: DocumentVector[] = [];
  private idf: Map<string, number> = new Map();
  private metadata: Map<string, string> = new Map(); // Store summaries

  public async createIndex(files: ProjectFile[]) {
    this.documents = [];
    this.idf.clear();
    this.metadata.clear();

    const tfMaps: { path: string; tf: Map<string, number> }[] = [];
    const docCounts: Map<string, number> = new Map();

    // 1. Calculate Term Frequency (TF)
    files.forEach(file => {
      // Skip binary/large non-code files
      if (file.language !== 'python' && !file.path.endsWith('.txt') && !file.path.endsWith('.md')) return;

      const tokens = tokenize(file.content);
      const tf = new Map<string, number>();
      
      tokens.forEach(t => {
        tf.set(t, (tf.get(t) || 0) + 1);
      });

      // Update doc counts for IDF
      const uniqueTokens = new Set(tokens);
      uniqueTokens.forEach(t => {
        docCounts.set(t, (docCounts.get(t) || 0) + 1);
      });

      tfMaps.push({ path: file.path, tf });
      
      // Generate pseudo-metadata (first 200 chars as summary for now)
      this.metadata.set(file.path, file.content.slice(0, 200).replace(/\s+/g, ' ') + "...");
    });

    // 2. Calculate Inverse Document Frequency (IDF)
    const N = files.length;
    docCounts.forEach((count, term) => {
      this.idf.set(term, Math.log(N / (1 + count)));
    });

    // 3. Create Vectors
    this.documents = tfMaps.map(({ path, tf }) => {
      const vector = new Map<string, number>();
      let magnitudeSq = 0;

      tf.forEach((count, term) => {
        const score = count * (this.idf.get(term) || 0);
        vector.set(term, score);
        magnitudeSq += score * score;
      });

      return {
        path,
        vector,
        magnitude: Math.sqrt(magnitudeSq)
      };
    });
    
    console.log(`[VectorIndex] Indexed ${this.documents.length} files.`);
  }

  public search(query: string, limit = 3): { path: string; score: number; snippet: string }[] {
    const tokens = tokenize(query);
    const queryVector = new Map<string, number>();
    let queryMagSq = 0;

    // Vectorize Query
    tokens.forEach(t => {
      const tf = (queryVector.get(t) || 0) + 1;
      queryVector.set(t, tf);
    });
    
    // Apply IDF to query
    queryVector.forEach((count, term) => {
      const score = count * (this.idf.get(term) || 0);
      queryVector.set(term, score);
      queryMagSq += score * score;
    });
    const queryMagnitude = Math.sqrt(queryMagSq);

    if (queryMagnitude === 0) return [];

    // Cosine Similarity
    const results = this.documents.map(doc => {
      let dotProduct = 0;
      queryVector.forEach((qScore, term) => {
        const dScore = doc.vector.get(term);
        if (dScore) {
          dotProduct += qScore * dScore;
        }
      });

      const similarity = dotProduct / (queryMagnitude * doc.magnitude);
      return {
        path: doc.path,
        score: similarity || 0,
        snippet: this.metadata.get(doc.path) || ""
      };
    });

    return results
      .sort((a, b) => b.score - a.score)
      .filter(r => r.score > 0.1) // Basic threshold
      .slice(0, limit);
  }

  public exportState(): string {
    return JSON.stringify({
      idf: Array.from(this.idf.entries()),
      metadata: Array.from(this.metadata.entries())
    });
  }

  public importState(json: string) {
    try {
      const data = JSON.parse(json);
      this.idf = new Map(data.idf);
      this.metadata = new Map(data.metadata);
    } catch (e) {
      console.error("Failed to load vector index state", e);
    }
  }
}

export const vectorService = new VectorIndex();
