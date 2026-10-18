// Reads emails from the local stack's mail catcher: Mailpit, or Inbucket in older CLI versions.
// Plain `fetch` only (no Node APIs, no `@/` imports), so Vitest and Playwright can share it.

export interface Email {
  subject: string;
  html: string;
}

export interface WaitForEmailOptions {
  /** Exact subject line. */
  subject?: string;
  /** Skip messages the mail catcher received before this time. */
  after?: Date;
  /** Default 10 000 ms. */
  timeoutMs?: number;
}

type MailApi = 'mailpit' | 'inbucket';

interface MessageSummary {
  id: string;
  subject: string;
  /** Lowercased recipient addresses. */
  to: string[];
  receivedAt: number;
}

const POLL_INTERVAL_MS = 250;
const DEFAULT_TIMEOUT_MS = 10_000;

/** Polls until a message to `to` arrives and returns the newest one that matches. */
export async function waitForEmail(
  mailUrl: string,
  to: string,
  options: WaitForEmailOptions = {},
): Promise<Email> {
  const { subject, after, timeoutMs = DEFAULT_TIMEOUT_MS } = options;
  const baseUrl = mailUrl.replace(/\/+$/, '');
  const address = to.trim().toLowerCase();
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  for (;;) {
    try {
      const email = await findNewest(baseUrl, address, subject, after);
      if (email) return email;
      lastError = null;
    } catch (error) {
      lastError = error;
    }
    if (Date.now() >= deadline) break;
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  const wanted = subject === undefined ? '' : ` with the subject "${subject}"`;
  const reason = lastError === null ? '' : ` (last error: ${errorText(lastError)})`;
  throw new Error(`No email to ${address}${wanted} within ${timeoutMs} ms${reason}`);
}

/** The first `token_hash=` value in an email; it ends at `&`, `"` or whitespace. */
export function tokenHashFrom(html: string): string {
  const tokenHash = /token_hash=([^&"\s]+)/.exec(html)?.[1];
  if (!tokenHash) throw new Error('No token_hash in email');
  return tokenHash;
}

async function findNewest(
  mailUrl: string,
  address: string,
  subject: string | undefined,
  after: Date | undefined,
): Promise<Email | null> {
  const api = await detectApi(mailUrl);
  const summaries =
    api === 'mailpit' ? await listMailpit(mailUrl, address) : await listInbucket(mailUrl, address);
  const newest = summaries
    .filter(
      (message) =>
        message.to.includes(address) &&
        (subject === undefined || message.subject === subject) &&
        (after === undefined || message.receivedAt >= after.getTime()),
    )
    .sort((a, b) => b.receivedAt - a.receivedAt)[0];
  if (!newest) return null;
  return api === 'mailpit'
    ? readMailpit(mailUrl, newest.id)
    : readInbucket(mailUrl, address, newest.id);
}

const detectedApis = new Map<string, Promise<MailApi>>();

/** Asks once per mail URL: Mailpit answers `/api/v1/info` with 200; anything else is Inbucket. */
function detectApi(mailUrl: string): Promise<MailApi> {
  const known = detectedApis.get(mailUrl);
  if (known) return known;
  const api = fetch(`${mailUrl}/api/v1/info`).then(async (response): Promise<MailApi> => {
    await response.body?.cancel();
    return response.status === 200 ? 'mailpit' : 'inbucket';
  });
  detectedApis.set(mailUrl, api);
  // A network error is no answer: the next poll asks again.
  api.catch(() => {
    if (detectedApis.get(mailUrl) === api) detectedApis.delete(mailUrl);
  });
  return api;
}

async function listMailpit(mailUrl: string, address: string): Promise<MessageSummary[]> {
  const query = encodeURIComponent(`to:"${address}"`);
  const body = await getJson(`${mailUrl}/api/v1/search?query=${query}`);
  const messages = isRecord(body) ? list(body.messages) : [];
  return messages.filter(isRecord).map((message) => ({
    id: text(message.ID),
    subject: text(message.Subject),
    to: list(message.To)
      .filter(isRecord)
      .map((recipient) => text(recipient.Address).trim().toLowerCase()),
    receivedAt: Date.parse(text(message.Created)),
  }));
}

async function readMailpit(mailUrl: string, id: string): Promise<Email> {
  const body = await getJson(`${mailUrl}/api/v1/message/${encodeURIComponent(id)}`);
  if (!isRecord(body)) throw new Error(`Mailpit message ${id} is not a JSON object`);
  return { subject: text(body.Subject), html: text(body.HTML) };
}

async function listInbucket(mailUrl: string, address: string): Promise<MessageSummary[]> {
  const body = await getJson(`${mailUrl}/api/v1/mailbox/${mailboxOf(address)}`);
  return list(body)
    .filter(isRecord)
    .map((message) => ({
      id: text(message.id),
      subject: text(message.subject),
      to: list(message.to).map((recipient) => addressIn(text(recipient))),
      receivedAt: Date.parse(text(message.date)),
    }));
}

async function readInbucket(mailUrl: string, address: string, id: string): Promise<Email> {
  const body = await getJson(
    `${mailUrl}/api/v1/mailbox/${mailboxOf(address)}/${encodeURIComponent(id)}`,
  );
  if (!isRecord(body)) throw new Error(`Inbucket message ${id} is not a JSON object`);
  const content = isRecord(body.body) ? body.body : {};
  return { subject: text(body.subject), html: text(content.html) };
}

/** Inbucket names each mailbox after the local part of the address. */
function mailboxOf(address: string): string {
  const at = address.indexOf('@');
  return encodeURIComponent(at === -1 ? address : address.slice(0, at));
}

/** `Name <a@b.c>` or `<a@b.c>` → `a@b.c`, lowercased. */
function addressIn(recipient: string): string {
  return (/<([^>]*)>/.exec(recipient)?.[1] ?? recipient).trim().toLowerCase();
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`GET ${url} answered ${response.status}`);
  }
  return response.json();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
