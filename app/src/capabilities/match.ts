/** Host-local vector matching over embeddings returned by nodes. */

export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export interface Ranked<T> {
  item: T;
  score: number;
}

export function rankBySimilarity<T>(
  query: number[],
  items: Array<{ item: T; vector: number[] }>,
  topK = 10,
): Ranked<T>[] {
  return items
    .map(({ item, vector }) => ({ item, score: cosine(query, vector) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, topK);
}
