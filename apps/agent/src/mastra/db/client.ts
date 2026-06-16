import { createClient, type Client } from '@libsql/client';
import { MASTRA_DB_URL } from '../storage';

let client: Client | null = null;

export function getDbClient(): Client {
  if (!client) {
    client = createClient({ url: MASTRA_DB_URL });
  }

  return client;
}
