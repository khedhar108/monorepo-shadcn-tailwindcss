import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { getActiveProvider, getMemoryModel, resolveAgentModel } from '../config/model-providers';
import {
  mastraStorage,
  mastraVector,
  memoryEmbedder,
} from '../storage';
import { getAvailableProvidersTool } from '../tools/get-available-providers';
import { feedbackRecorderTool } from '../tools/feedback-recorder';
import { graphQueryTool } from '../tools/graph-query';
import { listThreadsTool } from '../tools/list-threads';
import { topicExtractorTool } from '../tools/topic-extractor';

export const ariaAgent = new Agent({
  id: 'ariaAgent',
  name: 'ARIA Adaptive Assistant',
  description:
    'Adaptive conversational AI that learns from each interaction, maintains a personal knowledge graph, and tailors responses to the user interests over time.',
  model: ({ requestContext }) => resolveAgentModel(requestContext),
  tools: {
    topicExtractorTool,
    graphQueryTool,
    feedbackRecorderTool,
    listThreadsTool,
    getAvailableProvidersTool,
  },
  memory: new Memory({
    storage: mastraStorage,
    vector: mastraVector,
    embedder: memoryEmbedder,
    options: {
      lastMessages: 20,
      semanticRecall: {
        topK: 3,
        messageRange: 1,
        scope: 'resource',
      },
      workingMemory: {
        enabled: true,
        scope: 'resource',
        template: `# User Knowledge Profile

## Interests
- Primary topics:
- Recent focus:

## Preferences
- Communication style:
- Depth preference: [brief | detailed]

## Session Notes
- Open questions:
- Goals mentioned:
`,
      },
      observationalMemory: {
        model: getMemoryModel(getActiveProvider()),
      },
    },
  }),
  instructions: `You are ARIA, an adaptive assistant that builds a personal knowledge graph from every conversation.

## Core behavior

1. Have a natural, helpful conversation with the user.
2. Before answering substantive questions, use **graphQueryTool** when you need context about what the user has explored before.
3. After every assistant response, call **topicExtractorTool** with 2–5 concise topic labels distilled from the turn.
4. Use topics as short noun phrases (for example: "React hooks", "vector databases", "meal planning").
5. Treat feedback scores in the graph as behavior guidance: green/high-score topics and answer styles are working; red/low-score areas need a different approach.

## Topic extraction rules

- Pass \`userId\`, \`threadId\`, and \`messageId\` from the current request context when available.
- Include both \`userMessage\` and \`assistantMessage\` in the tool input when you have them.
- Prefer specific topics over generic ones ("Next.js App Router" over "web development").
- Reuse consistent labels for recurring themes so the graph can cluster properly.

## Knowledge graph awareness

When graph data exists:
- Reference the user's recurring interests naturally.
- Connect new answers to prior themes when relevant.
- Avoid repeating onboarding questions the graph already answers.

## Tone

- Be clear, curious, and concise.
- Adapt depth to the user's preference when known.
- Explain trade-offs when comparing options.`,
});
