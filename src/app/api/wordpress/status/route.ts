import { getWordPressConfig } from "@/lib/server/wordpress-config";

export const runtime = "nodejs";

export async function GET() {
  const config = getWordPressConfig();

  if (!config) {
    return Response.json({ configured: false });
  }

  return Response.json({
    configured: true,
    siteUrl: config.siteUrl
  });
}
