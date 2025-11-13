import nodemailer from "nodemailer";
import { google } from "googleapis";

const { OAuth2 } = google.auth;

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

function getEnvRefreshToken(): string | undefined {
  return process.env.GMAIL_REFRESH_TOKEN || process.env.REFRESH_TOKEN || process.env.SYSTEM_GMAIL_REFRESH_TOKEN || undefined;
}

function makeOAuth2Client(refreshToken?: string) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET env vars. Set them in .env");
  }
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI || "https://developers.google.com/oauthplayground";
  const oauth2Client = new OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, redirectUri);
  if (refreshToken) oauth2Client.setCredentials({ refresh_token: refreshToken });
  return oauth2Client;
}

/**
 * Validate refresh token by obtaining an access token and calling Gmail profile.
 * Throws descriptive errors for:
 *  - invalid_grant / token revoked
 *  - insufficient scopes (ACCESS_TOKEN_SCOPE_INSUFFICIENT)
 *  - token->email mismatch
 */
async function validateRefreshTokenMatchesEmail(refreshToken: string, expectedEmail: string) {
  const oauth2Client = makeOAuth2Client(refreshToken);

  // 1) exchange refresh -> access token
  let accessTokenResponse;
  try {
    accessTokenResponse = await oauth2Client.getAccessToken();
  } catch (err: any) {
    // googleapis throws with message containing invalid_grant etc
    const msg = err?.message || String(err);
    throw new Error(`Failed to refresh access token from refresh token: ${msg}. This usually means the refresh token is revoked or was issued to a different OAuth client.`);
  }

  const accessToken =
    typeof accessTokenResponse === "string"
      ? accessTokenResponse
      : (accessTokenResponse && (accessTokenResponse as any).token) || null;

  if (!accessToken) {
    throw new Error("Failed to obtain access token from Google. The refresh token may be invalid or missing required scopes.");
  }

  // 2) call Gmail profile API to confirm which email this token maps to
  const resp = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!resp.ok) {
    // try to parse the JSON error body for helpful details
    let bodyText = await resp.text();
    try {
      const parsed = JSON.parse(bodyText);
      // detect insufficient scope
      if (
        parsed?.error?.details?.some?.((d: any) => d?.reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT") ||
        parsed?.error?.status === "PERMISSION_DENIED" ||
        (parsed?.error?.errors && parsed.error.errors.some((e: any) => e.reason === "insufficientPermissions"))
      ) {
        throw new Error(
          `Insufficient scopes on token (HTTP ${resp.status}). The token does not include Gmail scopes. Re-authorize with scope: 'https://www.googleapis.com/auth/gmail.send' (or 'https://mail.google.com/').`
        );
      }
      // generic error returned
      throw new Error(`Gmail profile fetch returned HTTP ${resp.status}: ${JSON.stringify(parsed)}`);
    } catch (parseErr) {
      // body wasn't JSON
      throw new Error(`Gmail profile fetch failed: HTTP ${resp.status} - ${bodyText}`);
    }
  }

  const profile = await resp.json();
  const tokenEmail = profile?.emailAddress;
  if (!tokenEmail) throw new Error(`Gmail profile did not include emailAddress (profile=${JSON.stringify(profile)})`);
  if (tokenEmail.toLowerCase() !== expectedEmail.toLowerCase()) {
    throw new Error(`Refresh token belongs to ${tokenEmail} but you attempted to send as ${expectedEmail}. Use a refresh token for ${expectedEmail} or set GMAIL_USER to ${tokenEmail}.`);
  }

  // return the access token (caller can pass to nodemailer)
  return accessToken;
}

/**
 * Try to create a transporter using either:
 *  - per-user refresh token (opts.refreshToken) OR
 *  - system refresh token from env var
 *
 * The function will attempt per-user token first; if it fails and allowSystemFallback=true it will try the system token.
 * Throws descriptive errors when tokens are missing/invalid/insufficient-scope.
 */
async function createTransporter(opts?: { refreshToken?: string; userEmail?: string; allowSystemFallback?: boolean }) {
  const userEmail = opts?.userEmail || process.env.GMAIL_USER || process.env.GOOGLE_EMAIL;
  if (!userEmail) throw new Error("Missing sender email. Set GMAIL_USER or pass userEmail to createTransporter.");

  const envRefresh = getEnvRefreshToken();

  // try per-user token first if provided
  if (opts?.refreshToken) {
    try {
      const accessToken = await validateRefreshTokenMatchesEmail(opts.refreshToken, userEmail);
      return nodemailer.createTransport({
        service: "gmail",
        auth: {
          type: "OAuth2",
          user: userEmail,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: opts.refreshToken,
          accessToken,
        },
      } as any);
    } catch (perUserErr) {
      // if caller allows fallback, continue to try env token; otherwise rethrow with message
      if (!opts?.allowSystemFallback) {
        throw new Error(`Per-user refresh token validation failed: ${perUserErr.message}`);
      }
      console.warn("[Gmail] Per-user refresh token validation failed; will attempt system token (if present):", perUserErr.message);
      // fallthrough to system token attempt
    }
  }

  // try system token
  if (envRefresh) {
    try {
      const accessToken = await validateRefreshTokenMatchesEmail(envRefresh, userEmail);
      return nodemailer.createTransport({
        service: "gmail",
        auth: {
          type: "OAuth2",
          user: userEmail,
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          refreshToken: envRefresh,
          accessToken,
        },
      } as any);
    } catch (envErr) {
      throw new Error(`System refresh token validation failed: ${envErr.message}`);
    }
  }

  // no tokens at all
  throw new Error("No refresh token available. Provide a per-user refresh token or set GMAIL_REFRESH_TOKEN (or REFRESH_TOKEN). Ensure your OAuth flow requested access_type=offline and included the Gmail scope (https://www.googleapis.com/auth/gmail.send).");
}

/**
 * Send email using validated OAuth2 transporter.
 */
export async function sendEmail(
  options: EmailOptions,
  opts?: { refreshToken?: string; userEmail?: string; allowSystemFallback?: boolean }
): Promise<boolean> {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.warn("[Gmail] Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET.");
      return false;
    }

    const transporter = await createTransporter({
      refreshToken: opts?.refreshToken,
      userEmail: opts?.userEmail,
      allowSystemFallback: opts?.allowSystemFallback ?? true,
    });

    const mailOptions = {
      from: `"${process.env.APP_NAME || "NotionClone"}" <${opts?.userEmail || process.env.GMAIL_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("[Gmail] Email sent:", info.messageId);
    return true;
  } catch (err) {
    console.error("[Gmail] sendEmail error:", err);
    return false;
  }
}

/**
 * Test function for verifying configuration externally.
 */
export async function testGmailConnection(opts?: { refreshToken?: string; userEmail?: string }) : Promise<boolean> {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error("[Gmail] Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET");
      return false;
    }
    await createTransporter({
      refreshToken: opts?.refreshToken,
      userEmail: opts?.userEmail,
      allowSystemFallback: true,
    });
    console.log("[Gmail] testGmailConnection succeeded");
    return true;
  } catch (error) {
    console.error("[Gmail] testGmailConnection failed:", error);
    return false;
  }
}
