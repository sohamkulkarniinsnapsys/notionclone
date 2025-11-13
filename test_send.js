// scripts/test_send.js
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
require('dotenv').config();

(async () => {
  const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
  const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
  const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
  const USER_EMAIL = process.env.GMAIL_USER;

  const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

  const tokenResp = await oauth2Client.getAccessToken();
  const accessToken = typeof tokenResp === 'string' ? tokenResp : (tokenResp && tokenResp.token);
  console.log('accessToken present:', !!accessToken);

  const profile = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
    headers: { Authorization: `Bearer ${accessToken}` }
  }).then(r => r.json());
  console.log('profile.emailAddress =', profile.emailAddress);

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      type: 'OAuth2',
      user: USER_EMAIL,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
      accessToken,
    }
  });

  const info = await transporter.sendMail({
    from: `"NotionClone" <${USER_EMAIL}>`,
    to: USER_EMAIL,
    subject: 'Test email',
    text: 'If you receive this, OAuth-send works!',
  });
  console.log('sent:', info.messageId);
})();
