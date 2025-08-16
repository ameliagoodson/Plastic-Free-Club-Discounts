import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session, admin } = await authenticate.admin(request);

    // Get discount settings from database
    const discountSettings = await db.discountSettings.findUnique({
      where: { shop: session.shop },
    });

    console.log("Database discount settings:", JSON.stringify(discountSettings, null, 2));

    // Get all existing discount automatic nodes
    const discountsResponse = await admin.graphql(`
      query {
        discountNodes(first: 20) {
          edges {
            node {
              id
              discount {
                __typename
                ... on DiscountAutomaticApp {
                  title
                  status
                  discountClass
                  combinesWith {
                    orderDiscounts
                    productDiscounts
                    shippingDiscounts
                  }
                  startsAt
                  endsAt
                }
                ... on DiscountAutomaticBasic {
                  title
                  status
                  summary
                }
              }
              productMetafield: metafield(namespace: "$app:pfc-member-order-discount", key: "function-configuration") {
                value
              }
              shippingMetafield: metafield(namespace: "$app:pfc-shipping-discount", key: "function-configuration") {
                value
              }
              metafields(first: 10) {
                edges {
                  node {
                    namespace
                    key
                    value
                  }
                }
              }
            }
          }
        }
      }
    `);

    const discountsData = await discountsResponse.json();

    // Get all available functions
    const functionsResponse = await admin.graphql(`
      query {
        shopifyFunctions(first: 10) {
          nodes {
            id
            title
            apiType
          }
        }
      }
    `);

    const functionsData = await functionsResponse.json();

    return json({
      shop: session.shop,
      databaseSettings: discountSettings,
      existingDiscounts: discountsData.data?.discountNodes?.edges || [],
      availableFunctions: functionsData.data?.shopifyFunctions?.nodes || [],
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error("Debug error:", error);
    return json({ 
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString()
    });
  }
};