import { json } from "../../../../lib/editing/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Keys for the "Choose from Google Drive" button (app/DrivePicker.jsx). They are browser keys,
// public by design: the API key is limited to this site's address and to the Picker API in Google
// Cloud, and the client id only works from the origins listed there. Without them the button hides
// and the link field works as before.
export async function GET() {
  const clientId = process.env.GOOGLE_PICKER_CLIENT_ID || "";
  const apiKey = process.env.GOOGLE_PICKER_API_KEY || "";
  const appId = process.env.GOOGLE_PICKER_APP_ID || "";
  return json({ enabled: !!(clientId && apiKey && appId), clientId, apiKey, appId });
}
