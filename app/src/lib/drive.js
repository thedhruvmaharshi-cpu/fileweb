const SCOPE = "https://www.googleapis.com/auth/drive.readonly";

let tokenClient = null;
let accessToken = null;

export function initDriveAuth() {
  return new Promise((resolve, reject) => {
    if (typeof google === "undefined" || !google.accounts) {
      return reject(new Error("Google Identity Services not loaded yet"));
    }
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: () => {},
    });
    resolve();
  });
}

export function requestDriveAccess() {
  return new Promise((resolve, reject) => {
    if (!tokenClient) return reject(new Error("Auth not initialized"));
    tokenClient.callback = (response) => {
      if (response.error) return reject(new Error(response.error));
      accessToken = response.access_token;
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

async function driveFetch(path) {
  if (!accessToken) throw new Error("No access token. Connect Drive first.");
  const res = await fetch(`https://www.googleapis.com/drive/v3/${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive API error: ${res.status}`);
  return res.json();
}

export async function listFolders() {
  const q = encodeURIComponent("mimeType='application/vnd.google-apps.folder' and trashed=false");
  const data = await driveFetch(`files?q=${q}&fields=files(id,name,parents)&pageSize=100`);
  return data.files || [];
}

export async function listFilesInFolder(folderId, modifiedAfter) {
  let q = `'${folderId}' in parents and trashed=false and mimeType!='application/vnd.google-apps.folder'`;
  if (modifiedAfter) q += ` and modifiedTime > '${modifiedAfter}'`;
  const url = `files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,owners)&pageSize=100`;
  const data = await driveFetch(url);
  return data.files || [];
}

export function mimeToType(mime) {
  if (!mime) return "other";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime.includes("pdf")) return "document";
  if (mime.includes("document")) return "document";
  if (mime.includes("spreadsheet")) return "spreadsheet";
  if (mime.includes("presentation")) return "presentation";
  if (mime.includes("zip") || mime.includes("compressed")) return "archive";
  if (mime.startsWith("text/")) return "code";
  return "other";
}

export function formatBytes(bytes) {
  if (!bytes) return "";
  const n = Number(bytes);
  if (n < 1024) return n + " B";
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB";
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  return (n / 1024 / 1024 / 1024).toFixed(1) + " GB";
}

export function hasAccessToken() { return !!accessToken; }
export function clearAccessToken() { accessToken = null; }