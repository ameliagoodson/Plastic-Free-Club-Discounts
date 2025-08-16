import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");

  if (!shop) {
    return json({ error: "Missing shop parameter" }, { status: 400 });
  }

  try {
    // Get discount settings from database
    const settings = await db.discountSettings.findUnique({
      where: { shop },
    });

    if (!settings) {
      return json({
        isEnabled: false,
        discountPercent: 0,
        pfcMemberTag: "PFC_member",
      });
    }

    return json({
      isEnabled: settings.isEnabled,
      discountPercent: settings.discountPercent,
      pfcMemberTag: settings.pfcMemberTag,
    });
  } catch (error) {
    console.error("Error fetching discount settings:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
