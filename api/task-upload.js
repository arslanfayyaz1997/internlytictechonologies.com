import crypto from "node:crypto";

const allowedExtensions = new Set(["pdf", "doc", "docx"]);
const MAX_BYTES = 3 * 1024 * 1024;
const adminEmail = String(process.env.INTERNLYTIC_ADMIN_EMAIL || "arslanfayyaz1997@gmail.com").toLowerCase();

function send(res, status, payload) {
  return res.status(status).json(payload);
}
function b64url(value) {
  return Buffer.from(value).toString("base64").replace(/=/g, "").replace(/\\+/g, "-").replace(/\\//g, "_");
}
async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  }));
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const jwt = `${unsigned}.${signer.sign(serviceAccount.private_key, "base64").replace(/=/g, "").replace(/\\+/g, "-").replace(/\\//g, "_")}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt })
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || !token.access_token) throw new Error("Google Drive authentication failed.");
  return token.access_token;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "Method not allowed." });
  try {
    const authHeader = String(req.headers.authorization || "");
    const accessToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!accessToken) return send(res, 401, { error: "Please sign in again." });

    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
    const serviceAccountRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!supabaseUrl || !anonKey || !serviceRole || !folderId || !serviceAccountRaw) {
      return send(res, 503, { error: "Secure Google Drive upload is not configured. Ask the admin to finish the server environment setup." });
    }

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` } });
    const authUser = await userResponse.json();
    if (!userResponse.ok || !authUser.email) return send(res, 401, { error: "Your sign-in session has expired. Please sign in again." });
    const email = String(authUser.email).toLowerCase();

    const body = req.body || {};
    const fileName = String(body.fileName || "");
    const ext = fileName.split(".").pop().toLowerCase();
    const base64 = String(body.base64 || "");
    if (!allowedExtensions.has(ext)) return send(res, 400, { error: "Only PDF and Word files are accepted." });
    const fileBuffer = Buffer.from(base64, "base64");
    if (!fileBuffer.length || fileBuffer.length > MAX_BYTES) return send(res, 413, { error: "File must be 3 MB or smaller." });

    const serviceHeaders = { apikey: serviceRole, Authorization: `Bearer ${serviceRole}`, "Content-Type": "application/json" };
    const safeId = String(body.internId || "").replace(/[^A-Za-z0-9_-]/g, "");
    const lookup = await fetch(`${supabaseUrl}/rest/v1/certificates?select=certificate_id,student_email&certificate_id=eq.${encodeURIComponent(safeId)}&student_email=ilike.${encodeURIComponent(email)}`, { headers: serviceHeaders });
    const internRows = await lookup.json();
    if (!lookup.ok || !Array.isArray(internRows) || !internRows.length) return send(res, 403, { error: "Your email is not authorized for this intern record." });

    const serviceAccount = JSON.parse(serviceAccountRaw);
    const googleToken = await getGoogleAccessToken(serviceAccount);
    const metadata = { name: `${safeId}_${Date.now()}_${fileName.replace(/[^A-Za-z0-9._ -]/g, "_")}`, parents: [folderId], mimeType: body.mimeType || "application/octet-stream" };
    const boundary = `internlytic_${crypto.randomBytes(12).toString("hex")}`;
    const multipart = Buffer.concat([
      Buffer.from(`--${boundary}\\r\\nContent-Type: application/json; charset=UTF-8\\r\\n\\r\\n${JSON.stringify(metadata)}\\r\\n--${boundary}\\r\\nContent-Type: ${metadata.mimeType}\\r\\nContent-Transfer-Encoding: binary\\r\\n\\r\\n`),
      fileBuffer,
      Buffer.from(`\\r\\n--${boundary}--`)
    ]);
    const driveResponse = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,mimeType", {
      method: "POST",
      headers: { Authorization: `Bearer ${googleToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body: multipart
    });
    const driveFile = await driveResponse.json();
    if (!driveResponse.ok || !driveFile.id) return send(res, 502, { error: "Google Drive could not store this file." });
    const permissionHeaders = { Authorization: `Bearer ${googleToken}`, "Content-Type": "application/json" };
    for (const sharedEmail of [...new Set([email, adminEmail])]) {
      await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFile.id)}/permissions?sendNotificationEmail=false`, {
        method: "POST",
        headers: permissionHeaders,
        body: JSON.stringify({ type: "user", role: "reader", emailAddress: sharedEmail })
      });
    }
    return send(res, 200, { name: driveFile.name || fileName, url: driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`, id: driveFile.id });
  } catch (error) {
    console.error("Task upload error:", error?.message || error);
    return send(res, 500, { error: "Task file upload failed. Please try again or submit a link instead." });
  }
}
