// lib/email.ts - Email utility for sending invites and notifications
import nodemailer from 'nodemailer';

const SMTP_URL = process.env.SMTP_URL;
const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@notionclone.com';
const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';

/**
 * Create nodemailer transporter from SMTP_URL
 * Format: smtp://username:password@smtp.example.com:587
 */
function createTransporter() {
  if (!SMTP_URL) {
    console.warn('SMTP_URL not configured, emails will be logged to console');
    return null;
  }

  try {
    return nodemailer.createTransport(SMTP_URL);
  } catch (error) {
    console.error('Failed to create email transporter:', error);
    return null;
  }
}

interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send email via SMTP or log to console if SMTP not configured
 */
export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const { to, subject, html, text } = params;

  const transporter = createTransporter();

  if (!transporter) {
    // Fallback: log to console in development
    console.log('='.repeat(80));
    console.log('EMAIL (No SMTP configured)');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('HTML:', html);
    if (text) console.log('Text:', text);
    console.log('='.repeat(80));
    return true;
  }

  try {
    await transporter.sendMail({
      from: FROM_EMAIL,
      to,
      subject,
      html,
      text: text || htmlToText(html),
    });

    console.log(`Email sent successfully to ${to}`);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

/**
 * Send workspace invite email
 */
export async function sendWorkspaceInvite(params: {
  to: string;
  inviterName: string;
  workspaceName: string;
  role: string;
  token: string;
  expiresAt: Date;
}): Promise<boolean> {
  const { to, inviterName, workspaceName, role, token, expiresAt } = params;

  const acceptUrl = `${APP_URL}/api/invites/accept?token=${token}`;
  const expiresIn = Math.ceil(
    (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workspace Invite</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">You've been invited!</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-top: 0;">Hi there,</p>

    <p style="font-size: 16px;">
      <strong>${inviterName}</strong> has invited you to join the workspace <strong>${workspaceName}</strong> as a <strong>${role}</strong>.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${acceptUrl}" style="background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">
        Accept Invitation
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280;">
      Or copy and paste this URL into your browser:
    </p>
    <p style="font-size: 14px; color: #667eea; word-break: break-all;">
      ${acceptUrl}
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 13px; color: #9ca3af;">
      This invitation will expire in ${expiresIn} day${expiresIn !== 1 ? 's' : ''}.
    </p>
    <p style="font-size: 13px; color: #9ca3af;">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
  </div>

  <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
    <p>Notion Clone - Collaborative Document Editor</p>
  </div>
</body>
</html>
  `;

  const text = `
You've been invited!

${inviterName} has invited you to join the workspace "${workspaceName}" as a ${role}.

Accept your invitation by visiting:
${acceptUrl}

This invitation will expire in ${expiresIn} day${expiresIn !== 1 ? 's' : ''}.

If you didn't expect this invitation, you can safely ignore this email.
  `;

  return sendEmail({
    to,
    subject: `Invitation to join ${workspaceName}`,
    html,
    text,
  });
}

/**
 * Send document invite email
 */
export async function sendDocumentInvite(params: {
  to: string;
  inviterName: string;
  documentTitle: string;
  role: string;
  token: string;
  expiresAt: Date;
}): Promise<boolean> {
  const { to, inviterName, documentTitle, role, token, expiresAt } = params;

  const acceptUrl = `${APP_URL}/api/invites/accept?token=${token}`;
  const expiresIn = Math.ceil(
    (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Document Invite</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: white; margin: 0; font-size: 28px;">Document Shared With You</h1>
  </div>

  <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="font-size: 16px; margin-top: 0;">Hi there,</p>

    <p style="font-size: 16px;">
      <strong>${inviterName}</strong> has shared the document <strong>"${documentTitle}"</strong> with you as a <strong>${role}</strong>.
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${acceptUrl}" style="background: #667eea; color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px; display: inline-block;">
        Open Document
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280;">
      Or copy and paste this URL into your browser:
    </p>
    <p style="font-size: 14px; color: #667eea; word-break: break-all;">
      ${acceptUrl}
    </p>

    <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

    <p style="font-size: 13px; color: #9ca3af;">
      This invitation will expire in ${expiresIn} day${expiresIn !== 1 ? 's' : ''}.
    </p>
    <p style="font-size: 13px; color: #9ca3af;">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
  </div>

  <div style="text-align: center; margin-top: 20px; color: #9ca3af; font-size: 12px;">
    <p>Notion Clone - Collaborative Document Editor</p>
  </div>
</body>
</html>
  `;

  const text = `
Document Shared With You

${inviterName} has shared the document "${documentTitle}" with you as a ${role}.

Open the document by visiting:
${acceptUrl}

This invitation will expire in ${expiresIn} day${expiresIn !== 1 ? 's' : ''}.

If you didn't expect this invitation, you can safely ignore this email.
  `;

  return sendEmail({
    to,
    subject: `${inviterName} shared "${documentTitle}" with you`,
    html,
    text,
  });
}

/**
 * Simple HTML to text converter
 */
function htmlToText(html: string): string {
  return html
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(email: string): string {
  return email.toLowerCase().trim();
}
