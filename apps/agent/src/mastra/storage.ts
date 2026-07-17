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

/**
 * Semantic-recall embedder. Chat can use NVIDIA/Groq/etc, but Mastra's built-in
 * embedding router only auto-resolves OpenAI/Google keys. When OPENAI_API_KEY
 * is missing we fall back to NVIDIA's OpenAI-compatible NIM embeddings.
 */
function resolveMemoryEmbedder(): ModelRouterEmbeddingModel {
  if (process.env.OPENAI_API_KEY?.trim()) {
    return new ModelRouterEmbeddingModel('openai/text-embedding-3-small');
  }

  if (process.env.GOOGLE_API_KEY?.trim() || process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
    return new ModelRouterEmbeddingModel('google/gemini-embedding-001');
  }

  const nvidiaKey = process.env.NVIDIA_API_KEY?.trim();
  if (nvidiaKey) {
    const modelId =
      process.env.LLM_EMBEDDING_MODEL?.trim() || 'nvidia/nv-embedqa-e5-v5';
    return new ModelRouterEmbeddingModel({
      id: modelId.includes('/') ? (modelId as `${string}/${string}`) : `nvidia/${modelId}`,
      url: 'https://integrate.api.nvidia.com/v1',
      apiKey: nvidiaKey,
    });
  }

  throw new Error(
    'No embedding API key found. Set OPENAI_API_KEY (preferred), GOOGLE_API_KEY, or NVIDIA_API_KEY for memory/semantic recall.',
  );
}

export const memoryEmbedder = resolveMemoryEmbedder();
