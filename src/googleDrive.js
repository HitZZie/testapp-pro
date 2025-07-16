import { google } from 'googleapis';

const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

export async function authenticate() {
  const auth = new google.auth.OAuth2(
    YOUR_CLIENT_ID,
    YOUR_CLIENT_SECRET,
    YOUR_REDIRECT_URI
  );
  return auth;
}

export async function listFiles(auth) {
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.list();
  return res.data.files;
}

export async function downloadFile(auth, fileId) {
  const drive = google.drive({ version: 'v3', auth });
  const res = await drive.files.get({ fileId, alt: 'media' });
  return res.data;
}