// packages/motorical-mcp/src/permissionNeeded.js
/**
 * The one sentence every "you need another permission" message ends with, so a person (or an agent relaying to one)
 * is always told the single reliable step. It is the same words on the connect page (docs-site, token
 * %%hosted.permissionNeededSentence%%), in the handshake text and in the 403 `insufficient_scope` message.
 * Client-neutral on purpose: no client is named, because the menu names differ between clients and change.
 */
export const PERMISSION_NEEDED_SENTENCE = 'Approve the permission when it is asked for (or add it in the Motorical dashboard under Settings, API, Connected AI Agents), '
  + 'then start a new chat or reconnect the connector if the tools still do not appear.';

export const CONNECT_PAGE_URL = 'https://docs.motorical.com/connect-your-agent';
