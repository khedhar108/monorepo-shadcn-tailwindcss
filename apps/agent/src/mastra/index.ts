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
import { ensureUserHubs } from './db/graph-service';
import { feedbackRecorderTool } from './tools/feedback-recorder';
import { getAvailableProvidersTool } from './tools/get-available-providers';
import { getPreferencesTool } from './tools/get-preferences';
import { graphQueryTool } from './tools/graph-query';
import { listThreadsTool } from './tools/list-threads';
import { topicExtractorTool } from './tools/topic-extractor';
import { mastraStorage } from './storage';

void ensureGraphSchema()
  .then(() => ensureUserHubs(['global']))
  .catch((error: unknown) => {
    console.error('Failed to initialize ARIA graph schema:', error);
  });

export const mastra = new Mastra({
  agents: { ariaAgent, feedbackSummarizer },
  tools: {
    getAvailableProvidersTool,
    getPreferencesTool,
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
