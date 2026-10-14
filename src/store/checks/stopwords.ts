/** Stop-words removed before `check.near-duplicate` compares `about` lines (spec store.validate Rule 3). */
export const STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'into', 'onto',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'it', 'its', 'this', 'that', 'these', 'those', 'as',
  'do', 'does', 'did', 'has', 'have', 'had', 'get', 'gets', 'got', 'every', 'each', 'any', 'all',
  'what', 'which', 'who', 'whom', 'how', 'why', 'when', 'where', 'we', 'our', 'you', 'your', 'they', 'their',
  'not', 'no', 'so', 'than', 'then', 'there', 'here', 'can', 'will', 'would', 'should', 'may', 'must',
]);
