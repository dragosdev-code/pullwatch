import { google } from 'googleapis';

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS = 60_000;
const CODE_REGEX = /\b(\d{6})\b/;

/**
 * Polls the canary bot's Gmail inbox for a GitHub device-verification email
 * and extracts the 6-digit OTP code.
 *
 * Prerequisites (env vars):
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 *
 * After extracting the code the message is marked as READ so subsequent
 * CI runs don't pick up the same email.
 */
export async function getGitHubVerificationCode(): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      '[gmail] Missing one or more GMAIL_* env vars (GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN)',
    );
  }

  console.log('  [gmail] Initializing OAuth2 client...');
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret);
  oauth2.setCredentials({ refresh_token: refreshToken });

  const gmail = google.gmail({ version: 'v1', auth: oauth2 });

  const deadline = Date.now() + MAX_POLL_MS;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    console.log(`  [gmail] Poll attempt ${attempt} — searching for unread GitHub verification email...`);

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: 'from:noreply@github.com is:unread',
      maxResults: 5,
    });

    const messages = listRes.data.messages;
    if (!messages || messages.length === 0) {
      console.log(`  [gmail] No matching emails yet. Waiting ${POLL_INTERVAL_MS / 1000}s...`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    console.log(`  [gmail] Found ${messages.length} unread email(s) from GitHub. Checking newest first...`);

    for (const msg of messages) {
      const msgId = msg.id!;
      console.log(`  [gmail] Reading message ${msgId}...`);

      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msgId,
        format: 'full',
      });

      const body = extractBody(fullMsg.data);
      if (!body) {
        console.log(`  [gmail] Message ${msgId} — could not decode body, skipping.`);
        continue;
      }

      const match = body.match(CODE_REGEX);
      if (!match) {
        console.log(`  [gmail] Message ${msgId} — no 6-digit code found in body, skipping.`);
        continue;
      }

      const code = match[1];
      console.log(`  [gmail] Extracted verification code: ${code} (from message ${msgId})`);

      console.log(`  [gmail] Marking message ${msgId} as read...`);
      await gmail.users.messages.modify({
        userId: 'me',
        id: msgId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
      console.log(`  [gmail] Message ${msgId} marked as read.`);

      return code;
    }

    console.log(`  [gmail] None of the emails contained a 6-digit code. Waiting ${POLL_INTERVAL_MS / 1000}s...`);
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `[gmail] Timed out after ${MAX_POLL_MS / 1000}s — no GitHub verification code found in inbox.`,
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Walks the MIME parts tree of a Gmail message and returns the decoded
 * text body (prefers text/plain, falls back to text/html).
 */
function extractBody(message: { payload?: { body?: { data?: string | null }; parts?: Part[]; mimeType?: string | null } }): string | null {
  const payload = message.payload;
  if (!payload) return null;

  // Simple single-part message
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }

  // Multipart — recurse through parts
  if (payload.parts) {
    const plainPart = findPart(payload.parts, 'text/plain');
    if (plainPart?.body?.data) {
      return decodeBase64Url(plainPart.body.data);
    }

    const htmlPart = findPart(payload.parts, 'text/html');
    if (htmlPart?.body?.data) {
      return decodeBase64Url(htmlPart.body.data);
    }
  }

  return null;
}

interface Part {
  mimeType?: string | null;
  body?: { data?: string | null };
  parts?: Part[];
}

function findPart(parts: Part[], mimeType: string): Part | undefined {
  for (const part of parts) {
    if (part.mimeType === mimeType) return part;
    if (part.parts) {
      const nested = findPart(part.parts, mimeType);
      if (nested) return nested;
    }
  }
  return undefined;
}

function decodeBase64Url(encoded: string): string {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}
