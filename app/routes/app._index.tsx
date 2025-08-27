import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useFetcher, useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Text,
  Card,
  Button,
  BlockStack,
  InlineStack,
  TextField,
  Banner,
  Checkbox,
  Collapsible,
} from "@shopify/polaris";
import { TitleBar, useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import db from "../db.server";

type LoaderData = {
  discountSettings: {
    id: string;
    shop: string;
    discountPercent: number;
    isEnabled: boolean;
    freeShippingEnabled: boolean;
    productDiscountMessage: string;
    shippingDiscountMessage: string;
    productDiscountId?: string | null;
    shippingDiscountId?: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  debugInfo: {
    productCount: number;
    sampleProducts: Array<{
      id: string;
      title: string;
      variants: Array<{
        id: string;
        price: string;
        compareAtPrice?: string | null;
      }>;
    }>;
    sampleCustomers: Array<{
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      tags: string[];
    }>;
  };
};

type ActionData = {
  success?: boolean;
  error?: string;
  message?: string;
  discountSettings?: any;
  action?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session, admin } = await authenticate.admin(request);

    // Get existing discount settings or create default
    let discountSettings = await (db as any).discountSettings.findUnique({
      where: { shop: session.shop },
    });

    if (!discountSettings) {
      discountSettings = await (db as any).discountSettings.create({
        data: {
          shop: session.shop,
          discountPercent: 0,
          isEnabled: false,
          freeShippingEnabled: false,
          productDiscountMessage: "PFC Member Discount",
          shippingDiscountMessage: "Free Shipping for PFC Members",
          productDiscountId: null,
          shippingDiscountId: null,
        },
      });
    }


    // Get debug info - sample products
    let products: any[] = [];
    try {
      const productsResponse = await admin.graphql(
        `
        query getProducts($first: Int!) {
          products(first: $first) {
            edges {
              node {
            id
            title
                variants(first: 3) {
              edges {
                node {
                  id
                  price
                      compareAtPrice
                    }
                  }
                }
              }
            }
          }
        }
      `,
        {
          variables: { first: 5 },
        },
      );

      const productsData = await productsResponse.json();
      products = productsData.data?.products?.edges || [];
    } catch (error) {
      console.log("Could not fetch products for debug info:", error);
    }

    // Get sample customers for testing
    let sampleCustomers: any[] = [];
    try {
      const customersResponse = await admin.graphql(
        `
        query getCustomers($first: Int!) {
          customers(first: $first) {
            edges {
              node {
                id
                firstName
                lastName
                email
                tags
              }
            }
          }
        }
      `,
        {
          variables: { first: 5 },
        },
      );

      const customersData = await customersResponse.json();
      const customers = customersData.data?.customers?.edges || [];
      sampleCustomers = customers.map((edge: any) => ({
        id: edge.node.id.replace("gid://shopify/Customer/", ""),
        firstName: edge.node.firstName,
        lastName: edge.node.lastName,
        email: edge.node.email,
        tags: edge.node.tags || [],
      }));
    } catch (error) {
      console.log("Could not fetch customers for debug info:", error);
      // Don't crash the app if we can't fetch customers
      sampleCustomers = [];
    }

    const debugInfo = {
      productCount: products.length,
      sampleProducts: products.map((edge: any) => ({
        id: edge.node.id,
        title: edge.node.title,
        variants: edge.node.variants.edges.map((vEdge: any) => ({
          id: vEdge.node.id,
          price: vEdge.node.price,
          compareAtPrice: vEdge.node.compareAtPrice,
        })),
      })),
      sampleCustomers,
    };

    return json({ discountSettings, debugInfo });
  } catch (error) {
    console.error("Error in loader:", error);
    // Return a basic response if authentication fails
    return json({
      discountSettings: {
        id: "default",
        shop: "unknown",
        discountPercent: 0,
        isEnabled: false,
        freeShippingEnabled: false,
        productDiscountMessage: "PFC Member Discount",
        shippingDiscountMessage: "Free Shipping for PFC Members",
        productDiscountId: null,
        shippingDiscountId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      debugInfo: {
        productCount: 0,
        sampleProducts: [],
        sampleCustomers: [],
      },
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action") as string;

  if (actionType === "saveAndConfigure") {
    // First save the settings
    const discountPercent = parseFloat(
      formData.get("discountPercent") as string,
    );
    const isEnabled = formData.get("isEnabled") === "true";
    const freeShippingEnabled = formData.get("freeShippingEnabled") === "true";
    const productDiscountMessage = formData.get("productDiscountMessage") as string;
    const shippingDiscountMessage = formData.get("shippingDiscountMessage") as string;

    // Validate discount percentage
    if (
      isNaN(discountPercent) ||
      discountPercent < 0 ||
      discountPercent > 100
    ) {
      return json({
        error: "Discount percentage must be between 0 and 100",
        success: false,
      } as ActionData);
    }

    // Validate messages
    if (!productDiscountMessage?.trim()) {
      return json({
        error: "Product discount message is required",
        success: false,
      } as ActionData);
    }

    if (!shippingDiscountMessage?.trim()) {
      return json({
        error: "Shipping discount message is required", 
        success: false,
      } as ActionData);
    }

    // Update settings first
    await (db as any).discountSettings.upsert({
      where: { shop: session.shop },
      update: {
        discountPercent,
        isEnabled,
        freeShippingEnabled,
        productDiscountMessage: productDiscountMessage.trim(),
        shippingDiscountMessage: shippingDiscountMessage.trim(),
      },
      create: {
        shop: session.shop,
        discountPercent,
        isEnabled,
        freeShippingEnabled,
        productDiscountMessage: productDiscountMessage.trim(),
        shippingDiscountMessage: shippingDiscountMessage.trim(),
        productDiscountId: null,
        shippingDiscountId: null,
      },
    });

    // Now automatically configure the discounts
    console.log("=== SAVING SETTINGS AND CONFIGURING PFC DISCOUNTS ===");

    // Set the formData to trigger createDiscount logic
    formData.set("action", "createDiscount");
    // Fall through to the createDiscount logic below by not returning here
  }

  if (actionType === "createDiscount" || actionType === "saveAndConfigure") {
    console.log("=== CREATING AND CONFIGURING PFC DISCOUNTS ===");

    try {
      // Get current settings to use for the discount
      const discountSettings = await (db as any).discountSettings.findUnique({
        where: { shop: session.shop },
      });

      console.log(
        "Current discount settings:",
        JSON.stringify(discountSettings, null, 2),
      );

      if (!discountSettings) {
        return json({
          success: false,
          error: "Please save your discount settings first",
          action: "createDiscount",
        } as ActionData);
      }

      let productId: string | null = discountSettings.productDiscountId;
      let shippingId: string | null = discountSettings.shippingDiscountId;

      console.log("Initial IDs - Product:", productId, "Shipping:", shippingId);

      // Delete existing product discount to recreate with new combining rules
      if (productId) {
        console.log("Deleting existing product discount to recreate with new settings...");
        try {
          await admin.graphql(`
            mutation discountAutomaticDelete($id: ID!) {
              discountAutomaticDelete(id: $id) {
                deletedAutomaticDiscountId
                userErrors {
                  field
                  message
                }
              }
            }
          `, {
            variables: { id: productId }
          });
          console.log("Successfully deleted old product discount");
          productId = null; // Reset so we create a new one
        } catch (error) {
          console.log("Could not delete old product discount (may not exist):", error);
          productId = null; // Reset anyway
        }
      }

      // First, get all available functions to find the right IDs
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
      const functions = functionsData.data?.shopifyFunctions?.nodes || [];

      console.log("Available functions:", functions);

      // Find the product discount function (order discount)
      const productFunction = functions.find(
        (f: any) =>
          f.apiType === "order_discounts" ||
          f.title?.includes("order") ||
          f.title?.includes("product"),
      );

      // Find the shipping discount function
      const shippingFunction = functions.find(
        (f: any) =>
          f.apiType === "shipping_discounts" || f.title?.includes("shipping"),
      );

      console.log("Product function:", productFunction);
      console.log("Shipping function:", shippingFunction);

      // Create product discount (always create since we deleted the old one above)
      if (
        !productId &&
        discountSettings.isEnabled &&
        discountSettings.discountPercent > 0 &&
        productFunction
      ) {
        console.log("Creating product discount...");
        const createProductResponse = await admin.graphql(
          `
          mutation discountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
            discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
              automaticAppDiscount {
                discountId
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              automaticAppDiscount: {
                title: "PFC Member Product Discount",
                functionId: productFunction.id,
                startsAt: new Date().toISOString(),
                combinesWith: {
                  orderDiscounts: false,
                  productDiscounts: true, // Allow combining with product discounts (itself)
                  shippingDiscounts: true,
                },
              },
            },
          },
        );

        const createProductData = await createProductResponse.json();
        if (
          createProductData.data?.discountAutomaticAppCreate?.userErrors
            ?.length > 0
        ) {
          return json({
            success: false,
            error: `Failed to create product discount: ${createProductData.data.discountAutomaticAppCreate.userErrors[0].message}`,
            action: "createDiscount",
          } as ActionData);
        }

        productId =
          createProductData.data?.discountAutomaticAppCreate
            ?.automaticAppDiscount?.discountId;
        console.log("Created product discount with ID:", productId);
      }

      // Create shipping discount if needed and enabled
      if (
        !shippingId &&
        discountSettings.freeShippingEnabled &&
        shippingFunction
      ) {
        console.log("Creating shipping discount...");
        const createShippingResponse = await admin.graphql(
          `
          mutation discountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
            discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
              automaticAppDiscount {
                discountId
              }
              userErrors {
                field
                message
              }
            }
          }
        `,
          {
            variables: {
              automaticAppDiscount: {
                title: "PFC Member Free Shipping",
                functionId: shippingFunction.id,
                startsAt: new Date().toISOString(),
                combinesWith: {
                  orderDiscounts: true,
                  productDiscounts: true,
                  shippingDiscounts: false,
                },
              },
            },
          },
        );

        const createShippingData = await createShippingResponse.json();
        if (
          createShippingData.data?.discountAutomaticAppCreate?.userErrors
            ?.length > 0
        ) {
          return json({
            success: false,
            error: `Failed to create shipping discount: ${createShippingData.data.discountAutomaticAppCreate.userErrors[0].message}`,
            action: "createDiscount",
          } as ActionData);
        }

        shippingId =
          createShippingData.data?.discountAutomaticAppCreate
            ?.automaticAppDiscount?.discountId;
        console.log("Created shipping discount with ID:", shippingId);
      }

      // Save the IDs back to the database
      if (productId || shippingId) {
        await (db as any).discountSettings.update({
          where: { shop: session.shop },
          data: {
            productDiscountId: productId,
            shippingDiscountId: shippingId,
          },
        });
      }

      // Check if we have the functions but couldn't create discounts
      if (
        discountSettings.isEnabled &&
        discountSettings.discountPercent > 0 &&
        !productFunction
      ) {
        return json({
          success: false,
          error:
            "Product discount function not found. Please deploy your app first with: shopify app deploy",
          action: "createDiscount",
        } as ActionData);
      }

      if (discountSettings.freeShippingEnabled && !shippingFunction) {
        return json({
          success: false,
          error:
            "Shipping discount function not found. Please deploy your app first with: shopify app deploy",
          action: "createDiscount",
        } as ActionData);
      }

      if (!productId && !shippingId) {
        return json({
          success: false,
          error:
            "No discounts to create. Enable product discount or free shipping first.",
          action: "createDiscount",
        } as ActionData);
      }

      // Build metafields upsert payload
      type MetafieldsSetInput = {
        ownerId?: string;
        id?: string;
        namespace?: string;
        key?: string;
        type?: string;
        value?: string;
      };

      const metafields: MetafieldsSetInput[] = [];

      console.log("Building metafields...");
      console.log("Product enabled conditions:", {
        productId: !!productId,
        isEnabled: discountSettings.isEnabled,
        discountPercent: discountSettings.discountPercent,
      });
      console.log("Shipping enabled conditions:", {
        shippingId: !!shippingId,
        freeShippingEnabled: discountSettings.freeShippingEnabled,
      });

      if (
        productId &&
        discountSettings.isEnabled &&
        discountSettings.discountPercent > 0
      ) {
        console.log("Adding product metafield for ID:", productId);
        metafields.push({
          ownerId: productId,
          namespace: "$app:pfc-member-order-discount",
          key: "function-configuration",
          type: "json",
          value: JSON.stringify({
            percentage: discountSettings.discountPercent,
            productDiscountMessage: discountSettings.productDiscountMessage,
          }),
        });
      }

      if (shippingId) {
        console.log("Adding shipping metafield for ID:", shippingId);
        metafields.push({
          ownerId: shippingId,
          namespace: "$app:pfc-shipping-discount",
          key: "function-configuration",
          type: "json",
          value: JSON.stringify({
            enabled: !!discountSettings.freeShippingEnabled,
            shippingDiscountMessage: discountSettings.shippingDiscountMessage,
          }),
        });
      }

      console.log(
        "Final metafields to set:",
        JSON.stringify(metafields, null, 2),
      );

      if (metafields.length === 0) {
        return json({
          success: false,
          error:
            "Nothing to configure. Enable the discount and/or free shipping, then click Configure.",
          action: "createDiscount",
        } as ActionData);
      }

      // Before setting metafields, verify that all discount IDs actually exist
      console.log("Verifying discount IDs exist...");
      const idsToCheck = metafields.map((m) => m.ownerId).filter(Boolean);

      if (idsToCheck.length > 0) {
        const verifyResponse = await admin.graphql(
          `
          query($ids: [ID!]!) {
            nodes(ids: $ids) {
              id
              __typename
            }
          }
        `,
          { variables: { ids: idsToCheck } },
        );

        const verifyData = await verifyResponse.json();
        const existingNodes =
          verifyData.data?.nodes?.filter((n: any) => n && n.id) || [];
        const existingIds = existingNodes.map((n: any) => n.id);

        console.log("IDs to check:", idsToCheck);
        console.log("Existing IDs:", existingIds);

        // Filter metafields to only include those with existing discount IDs
        const validMetafields = metafields.filter(
          (m) => m.ownerId && existingIds.includes(m.ownerId),
        );
        const invalidIds = idsToCheck.filter((id) => !existingIds.includes(id));

        if (invalidIds.length > 0) {
          console.log("Invalid discount IDs found:", invalidIds);

          // Clean up invalid IDs from database
          const updateData: any = {};
          if (productId && invalidIds.includes(productId)) {
            updateData.productDiscountId = null;
          }
          if (shippingId && invalidIds.includes(shippingId)) {
            updateData.shippingDiscountId = null;
          }

          if (Object.keys(updateData).length > 0) {
            await db.discountSettings.update({
              where: { shop: session.shop },
              data: updateData,
            });
            console.log("Cleaned up invalid discount IDs from database");
          }
        }

        if (validMetafields.length === 0) {
          return json({
            success: false,
            error: `All discount IDs are invalid. The discounts may have been deleted. Invalid IDs: ${invalidIds.join(", ")}. Database has been cleaned up - try Configure again.`,
            action: "createDiscount",
          } as ActionData);
        }

        if (validMetafields.length < metafields.length) {
          console.log(
            `Configuring ${validMetafields.length} valid discounts, skipping ${metafields.length - validMetafields.length} invalid ones`,
          );
          metafields.splice(0, metafields.length, ...validMetafields);
        }
      }

      const setResp = await admin.graphql(
        `#graphql
        mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
          metafieldsSet(metafields: $metafields) {
            metafields { id key namespace type value }
            userErrors { field message code }
          }
        }`,
        { variables: { metafields } },
      );

      const setJson = await setResp.json();
      console.log("metafieldsSet response:", JSON.stringify(setJson, null, 2));
      const mErrors = setJson.data?.metafieldsSet?.userErrors || [];
      if (mErrors.length) {
        return json({
          success: false,
          error: `Failed to configure discounts: ${mErrors[0].message}`,
          action: "createDiscount",
        } as ActionData);
      }

      return json({
        success: true,
        message:
          actionType === "saveAndConfigure"
            ? `Settings saved and PFC discounts configured successfully${productId ? " (product)" : ""}${shippingId ? " (shipping)" : ""}.`
            : `Configured PFC discounts successfully${productId ? " (product)" : ""}${shippingId ? " (shipping)" : ""}.`,
        action: "createDiscount",
      } as ActionData);
    } catch (error) {
      console.error("Error configuring discounts:", error);
      return json({
        success: false,
        error: `Error configuring discounts: ${error instanceof Error ? error.message : String(error)}`,
        action: "createDiscount",
      } as ActionData);
    }
  }

  if (actionType === "applyDiscounts") {
    return json({
      success: false,
      message:
        "This feature is deprecated. Use dynamic pricing instead - prices are now calculated in real-time for members only.",
      action: "applyDiscounts",
      updatedCount: 0,
    } as ActionData);
  }

  // Fallback - redirect to use the Save Settings button
  return json({
    success: false,
    error:
      "Please use the Save Settings button to save and configure your discounts.",
  } as ActionData);
};

export default function DiscountSettings() {
  const { discountSettings, debugInfo } =
    useLoaderData<LoaderData>();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  const [percentage, setPercentage] = useState(
    discountSettings.discountPercent.toString(),
  );
  const [enabled, setEnabled] = useState(discountSettings.isEnabled);
  const [freeShippingEnabled, setFreeShippingEnabled] = useState(
    discountSettings.freeShippingEnabled || false,
  );
  const [productDiscountMessage, setProductDiscountMessage] = useState(
    discountSettings.productDiscountMessage || "PFC Member Discount",
  );
  const [shippingDiscountMessage, setShippingDiscountMessage] = useState(
    discountSettings.shippingDiscountMessage || "Free Shipping for PFC Members",
  );
  const [showDebug, setShowDebug] = useState(false);
  const [debugData, setDebugData] = useState<any>(null);

  const isLoading = fetcher.state === "submitting";
  const hasError = fetcher.data?.error;
  const hasSuccess = fetcher.data?.success;

  useEffect(() => {
    if (hasSuccess && fetcher.data?.message) {
      shopify.toast.show(fetcher.data.message);
    }
  }, [hasSuccess, fetcher.data?.message, shopify]);

  const handleSaveSettings = () => {
    const formData = new FormData();
    formData.append("discountPercent", percentage);
    formData.append("isEnabled", enabled.toString());
    formData.append("freeShippingEnabled", freeShippingEnabled.toString());
    formData.append("productDiscountMessage", productDiscountMessage);
    formData.append("shippingDiscountMessage", shippingDiscountMessage);
    formData.append("action", "saveAndConfigure"); // New action that does both
    fetcher.submit(formData, { method: "POST" });
  };

  return (
    <Page>
      <TitleBar title="Plastic Free Club Discounts" />
      <BlockStack gap="500">
        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="500">
                <Text as="h2" variant="headingLg">
                  Plastic Free Club Dynamic Pricing Settings
                </Text>

                {hasError && (
                  <Banner tone="critical">
                    <p>{fetcher.data?.error}</p>
                  </Banner>
                )}

                {hasSuccess && fetcher.data?.action === "applyDiscounts" && (
                  <Banner tone="info">
                    <p>{fetcher.data?.message}</p>
                  </Banner>
                )}

                <BlockStack gap="400">
                  <TextField
                    label="Discount Percentage"
                    type="number"
                    value={percentage}
                    onChange={setPercentage}
                    suffix="%"
                    helpText="Discount percentage applied from compare-at-price (stable reference price) for PFC members only"
                    autoComplete="off"
                  />


                  <Checkbox
                    label="Enable dynamic pricing"
                    checked={enabled}
                    onChange={setEnabled}
                    helpText={`Dynamic pricing is currently ${enabled ? "ACTIVE" : "DISABLED"} for PFC members`}
                  />

                  <Checkbox
                    label="Enable free shipping"
                    checked={freeShippingEnabled}
                    onChange={setFreeShippingEnabled}
                    helpText={`Free shipping is currently ${freeShippingEnabled ? "ACTIVE" : "DISABLED"} for PFC members`}
                  />

                  <TextField
                    label="Product Discount Message"
                    value={productDiscountMessage}
                    onChange={setProductDiscountMessage}
                    helpText="Custom message displayed for product discounts"
                    autoComplete="off"
                  />

                  <TextField
                    label="Shipping Discount Message"
                    value={shippingDiscountMessage}
                    onChange={setShippingDiscountMessage}
                    helpText="Custom message displayed for free shipping"
                    autoComplete="off"
                  />
                </BlockStack>

                <Button
                  variant="primary"
                  onClick={handleSaveSettings}
                  loading={isLoading}
                >
                  Save Settings
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h3" variant="headingMd">
                    Debug Information
                  </Text>
                  <Button
                    variant="plain"
                    onClick={() => setShowDebug(!showDebug)}
                  >
                    {showDebug ? "Hide" : "Show"} Debug Info
                  </Button>
                </InlineStack>

                <Collapsible open={showDebug} id="debug-info">
                  <BlockStack gap="200">
                    <Text as="h4" variant="headingSm">
                      Discount Debugging
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Use this button to diagnose issues with discount
                      configuration:
                    </Text>

                    <Button
                      variant="primary"
                      onClick={async () => {
                        try {
                          const response = await fetch("/api/debug-discounts");
                          const data = await response.json();
                          console.log("Debug discounts data:", data);

                          if (data.error) {
                            setDebugData({ error: data.error });
                            return;
                          }

                          setDebugData(data);
                        } catch (error) {
                          console.error("Debug failed:", error);
                          setDebugData({
                            error: `Debug failed: ${error instanceof Error ? error.message : String(error)}`,
                          });
                        }
                      }}
                    >
                      🔍 Debug Discounts
                    </Button>

                    <Text as="p" variant="bodyMd" tone="subdued">
                      This will show your current discount configuration,
                      available functions, and any errors.
                    </Text>

                    {debugData && (
                      <Card>
                        <BlockStack gap="200">
                          <Text as="h5" variant="headingXs">
                            Debug Results:
                          </Text>
                          {debugData.error ? (
                            <Banner tone="critical">
                              <p>{debugData.error}</p>
                            </Banner>
                          ) : (
                            <div
                              style={{
                                fontFamily: "monospace",
                                fontSize: "12px",
                                background: "#f6f6f7",
                                padding: "10px",
                                borderRadius: "4px",
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {JSON.stringify(debugData, null, 2)}
                            </div>
                          )}
                        </BlockStack>
                      </Card>
                    )}
                  </BlockStack>
                </Collapsible>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
