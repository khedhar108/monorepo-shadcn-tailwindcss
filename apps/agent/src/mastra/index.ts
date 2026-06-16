import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import {
  Observability,
  MastraStorageExporter,
  MastraPlatformExporter,
  SensitiveDataFilter,
} from '@mastra/observability';
import { ariaAgent } from './agents/aria-agent';
import { feedbackSummarizer } from './agents/feedback-summarizer';
import { ensureGraphSchema } from './db/schema';
import { feedbackRecorderTool } from './tools/feedback-recorder';
import { getAvailableProvidersTool } from './tools/get-available-providers';
import { graphQueryTool } from './tools/graph-query';
import { listThreadsTool } from './tools/list-threads';
import { topicExtractorTool } from './tools/topic-extractor';
import { mastraStorage } from './storage';

void ensureGraphSchema().catch((error: unknown) => {
  console.error('Failed to initialize ARIA graph schema:', error);
});

export const mastra = new Mastra({
  agents: { ariaAgent, feedbackSummarizer },
  tools: {
    getAvailableProvidersTool,
    listThreadsTool,
    topicExtractorTool,
    graphQueryTool,
    feedbackRecorderTool,
  },
  storage: mastraStorage,
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'mastra',
        exporters: [new MastraStorageExporter(), new MastraPlatformExporter()],
        spanOutputProcessors: [new SensitiveDataFilter()],
      },
    },
  }),
});
