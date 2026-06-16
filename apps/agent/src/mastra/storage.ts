import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { ModelRouterEmbeddingModel } from '@mastra/core/llm';

export const MASTRA_DB_URL = process.env.MASTRA_DB_URL ?? 'file:./mastra.db';

export const mastraStorage = new LibSQLStore({
  id: 'mastra-storage',
  url: MASTRA_DB_URL,
});

export const mastraVector = new LibSQLVector({
  id: 'mastra-vector',
  url: MASTRA_DB_URL,
});

export const memoryEmbedder = new ModelRouterEmbeddingModel(
  'openai/text-embedding-3-small',
);
