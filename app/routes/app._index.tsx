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
    pfcMemberTag: string;
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
  availableTags: string[];
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
          pfcMemberTag: "plastic-free-club",
        },
      });
    }

    // Get all available tags from customers (optional - may not have permissions)
    let availableTags: string[] = [];
    try {
      const customersResponse = await admin.graphql(
        `
        query getCustomersWithTags($first: Int!) {
          customers(first: $first) {
            edges {
              node {
                tags
              }
            }
          }
        }
      `,
        {
          variables: { first: 250 },
        },
      );

      const customersData = await customersResponse.json();
      const customers = customersData.data?.customers?.edges || [];

      // Extract all unique tags
      const allTags = new Set<string>();
      customers.forEach((edge: any) => {
        const tags = edge.node.tags || [];
        tags.forEach((tag: string) => allTags.add(tag));
      });

      availableTags = Array.from(allTags).sort();
    } catch (error) {
      console.log(
        "Could not fetch customer tags - permissions may be restricted:",
        error,
      );
      // Only provide the default configured tag
      availableTags = [discountSettings.pfcMemberTag];
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

    return json({ discountSettings, debugInfo, availableTags });
  } catch (error) {
    console.error("Error in loader:", error);
    // Return a basic response if authentication fails
    return json({
      discountSettings: {
        id: "default",
        shop: "unknown",
        discountPercent: 0,
        isEnabled: false,
        pfcMemberTag: "plastic-free-club",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      debugInfo: {
        productCount: 0,
        sampleProducts: [],
        sampleCustomers: [],
      },
      availableTags: ["plastic-free-club"],
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action") as string;

  if (actionType === "createDiscount") {
    // First, let's query available functions to get the correct function ID
    try {
      const functionsResponse = await admin.graphql(
        `#graphql
        query {
          shopifyFunctions(first: 50) {
            edges {
              node {
                id
                apiType
                title
              }
            }
          }
        }`,
      );

      const functionsData = await functionsResponse.json();
      console.log(
        "Available functions:",
        JSON.stringify(functionsData, null, 2),
      );

      const orderDiscountFunction =
        functionsData.data?.shopifyFunctions?.edges?.find(
          (edge: any) =>
            edge.node.apiType === "order_discounts" ||
            edge.node.title?.toLowerCase().includes("pfc") ||
            edge.node.title?.toLowerCase().includes("member"),
        );

      if (!orderDiscountFunction) {
        return json({
          success: false,
          error:
            "Order discount function not found. Make sure the function is properly deployed.",
          action: "createDiscount",
        } as ActionData);
      }

      const functionId = orderDiscountFunction.node.id;
      console.log("Using function ID:", functionId);

      // Get current settings to use for the discount
      const discountSettings = await (db as any).discountSettings.findUnique({
        where: { shop: session.shop },
      });

      if (!discountSettings) {
        return json({
          success: false,
          error: "Please save your discount settings first",
          action: "createDiscount",
        } as ActionData);
      }

      const configuration = JSON.stringify({
        percentage: discountSettings.discountPercent,
      });

      const response = await admin.graphql(
        `#graphql
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
        }`,
        {
          variables: {
            automaticAppDiscount: {
              title: `PFC Member Discount (${discountSettings.discountPercent}%)`,
              functionId: functionId,
              startsAt: new Date().toISOString(),
              metafields: [
                {
                  namespace: "$app:pfc-member-order-discount",
                  key: "function-configuration",
                  type: "json",
                  value: configuration,
                },
              ],
            },
          },
        },
      );

      const responseJson = await response.json();
      console.log("GraphQL Response:", JSON.stringify(responseJson, null, 2));

      if (
        responseJson.data?.discountAutomaticAppCreate?.userErrors?.length > 0
      ) {
        const errorMessage =
          responseJson.data.discountAutomaticAppCreate.userErrors[0].message;
        console.log("Discount creation error:", errorMessage);
        return json({
          success: false,
          error: `Discount creation failed: ${errorMessage}`,
          action: "createDiscount",
        } as ActionData);
      }

      if (
        !responseJson.data?.discountAutomaticAppCreate?.automaticAppDiscount
      ) {
        console.log("No discount created in response");
        return json({
          success: false,
          error:
            "Discount was not created - check that the function is properly deployed",
          action: "createDiscount",
        } as ActionData);
      }

      return json({
        success: true,
        message:
          "Automatic discount created successfully! It will now apply to PFC members at checkout.",
        action: "createDiscount",
      } as ActionData);
    } catch (error) {
      console.error("Error creating discount:", error);
      return json({
        success: false,
        error: `Failed to create discount: ${error instanceof Error ? error.message : "Unknown error"}`,
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

  // Default action: update settings
  const discountPercent = parseFloat(formData.get("discountPercent") as string);
  const isEnabled = formData.get("isEnabled") === "true";
  const pfcMemberTag = formData.get("pfcMemberTag") as string;

  // Validate discount percentage
  if (isNaN(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return json({
      error: "Discount percentage must be between 0 and 100",
      success: false,
    } as ActionData);
  }

  // Validate tag
  if (!pfcMemberTag || pfcMemberTag.trim() === "") {
    return json({
      error: "PFC member tag is required",
      success: false,
    } as ActionData);
  }

  // Update settings
  const updatedSettings = await (db as any).discountSettings.upsert({
    where: { shop: session.shop },
    update: {
      discountPercent,
      isEnabled,
      pfcMemberTag: pfcMemberTag.trim(),
    },
    create: {
      shop: session.shop,
      discountPercent,
      isEnabled,
      pfcMemberTag: pfcMemberTag.trim(),
    },
  });

  return json({
    success: true,
    discountSettings: updatedSettings,
    message: `Discount settings updated successfully! ${isEnabled ? "Dynamic pricing is now active for PFC members." : "Dynamic pricing is disabled."}`,
  } as ActionData);
};

export default function DiscountSettings() {
  const { discountSettings, debugInfo, availableTags } =
    useLoaderData<LoaderData>();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  const [percentage, setPercentage] = useState(
    discountSettings.discountPercent.toString(),
  );
  const [enabled, setEnabled] = useState(discountSettings.isEnabled);
  const [selectedTag, setSelectedTag] = useState(discountSettings.pfcMemberTag);
  const [showDebug, setShowDebug] = useState(false);

  const isLoading = fetcher.state === "submitting";
  const isCreatingDiscount =
    fetcher.state === "submitting" &&
    fetcher.formData?.get("action") === "createDiscount";
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
    formData.append("pfcMemberTag", selectedTag);
    fetcher.submit(formData, { method: "POST" });
  };

  const handleCreateDiscount = () => {
    const formData = new FormData();
    formData.append("action", "createDiscount");
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

                  <TextField
                    label="PFC Member Tag"
                    value={selectedTag}
                    onChange={setSelectedTag}
                    helpText="Enter the tag that identifies PFC members. This tag should be added by Appstle when customers purchase membership."
                    autoComplete="off"
                  />

                  {availableTags.length > 1 && (
                    <Banner tone="info">
                      <p>
                        Available tags in your store: {availableTags.join(", ")}
                      </p>
                    </Banner>
                  )}

                  {availableTags.length === 1 &&
                    availableTags[0] === discountSettings.pfcMemberTag && (
                      <Banner tone="info">
                        <p>
                          Could not fetch customer tags from your store. You can
                          manually enter any tag name above, or contact support
                          to grant additional permissions.
                        </p>
                      </Banner>
                    )}

                  <Checkbox
                    label="Enable dynamic pricing"
                    checked={enabled}
                    onChange={setEnabled}
                    helpText={`Dynamic pricing is currently ${enabled ? "ACTIVE" : "DISABLED"} for PFC members`}
                  />
                </BlockStack>

                <InlineStack gap="300">
                  <Button
                    variant="primary"
                    onClick={handleSaveSettings}
                    loading={isLoading}
                  >
                    Save Settings
                  </Button>
                  <Button
                    onClick={handleCreateDiscount}
                    loading={isCreatingDiscount}
                  >
                    Create Automatic Discount
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  How Dynamic Pricing Works
                </Text>

                <BlockStack gap="200">
                  <Text as="p" variant="bodyMd">
                    • Set your discount percentage above
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Select the tag that identifies PFC members
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Toggle to enable/disable dynamic pricing
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • All discounts calculated from compare-at-price
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • PFC members see discounted prices dynamically
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Non-members see regular retail prices
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Original prices stay unchanged in Shopify
                  </Text>
                  <Text as="p" variant="bodyMd">
                    • Pricing calculated in real-time via API
                  </Text>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h3" variant="headingMd">
                  🎯 Getting Pricing to Work
                </Text>

                <Banner tone="info">
                  <p>
                    <strong>✅ Cart Transform Function Deployed!</strong> Your
                    app now includes a cart transform function that applies PFC
                    discounts at checkout.
                  </p>
                </Banner>

                <BlockStack gap="200">
                  <Text as="h4" variant="headingSm">
                    Step 1: Configure Cart Transform Function
                  </Text>
                  <Text as="p" variant="bodyMd">
                    The cart transform function needs to be configured with
                    environment variables. You can set these in your Shopify
                    app's environment:
                  </Text>

                  <div
                    style={{
                      backgroundColor: "#f6f6f7",
                      padding: "12px",
                      borderRadius: "4px",
                      fontFamily: "monospace",
                      fontSize: "14px",
                    }}
                  >
                    <div>PFC_DISCOUNT_ENABLED=true</div>
                    <div>PFC_DISCOUNT_PERCENT={percentage}</div>
                    <div>PFC_MEMBER_TAG={selectedTag}</div>
                  </div>

                  <Text as="h4" variant="headingSm">
                    Step 2: Enable Cart Transform Function
                  </Text>
                  <Text as="p" variant="bodyMd">
                    1. Go to your Shopify admin → Settings → Apps and sales
                    channels
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. Find "Plastic Free Club Discounts" and click "Configure"
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Look for "Cart Transform Function" and enable it
                  </Text>

                  <Text as="h4" variant="headingSm">
                    Step 3: Test with PFC Member
                  </Text>
                  <Text as="p" variant="bodyMd">
                    1. Create or find a customer with the "{selectedTag}" tag
                  </Text>
                  <Text as="p" variant="bodyMd">
                    2. Add products to cart as that customer
                  </Text>
                  <Text as="p" variant="bodyMd">
                    3. Proceed to checkout - you should see discounted prices
                  </Text>

                  <Banner tone="success">
                    <p>
                      <strong>🎉 Success!</strong> Once configured, PFC members
                      will automatically see discounted prices at checkout,
                      calculated from your compare-at-prices.
                    </p>
                  </Banner>
                </BlockStack>
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
                    <Text as="p" variant="bodyMd">
                      <strong>Current Status:</strong> Dynamic pricing is{" "}
                      {enabled ? "enabled" : "disabled"}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Discount Percentage:</strong> {percentage}%
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>PFC Member Tag:</strong> {selectedTag}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Products Found:</strong> {debugInfo.productCount}
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Available Tags:</strong> {availableTags.length}{" "}
                      tags found
                    </Text>

                    <Banner tone="warning">
                      <p>
                        <strong>⚠️ IMPORTANT:</strong> Dynamic pricing is
                        currently backend-only. Your Shopify theme needs to be
                        updated to display discounted prices for PFC members.
                      </p>
                    </Banner>

                    <Text as="h4" variant="headingSm">
                      Testing Endpoints
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Test Customer:</strong>{" "}
                      <code>
                        /api/test-customer?customerId=YOUR_CUSTOMER_ID
                      </code>
                    </Text>
                    <Text as="p" variant="bodyMd">
                      <strong>Test Discount:</strong>{" "}
                      <code>
                        /api/customer-discount?customerId=YOUR_CUSTOMER_ID&productId=PRODUCT_ID&variantId=VARIANT_ID
                      </code>
                    </Text>

                    <Text as="h4" variant="headingSm">
                      Quick Test
                    </Text>
                    <Text as="p" variant="bodyMd">
                      Test your customer detection with your customer ID:
                    </Text>

                    <Button
                      variant="primary"
                      onClick={async () => {
                        try {
                          const response = await fetch(
                            "/api/test-customer?customerId=9304638554387",
                          );
                          const data = await response.json();
                          console.log("Test customer response:", data);

                          if (data.error) {
                            if (
                              data.error ===
                              "Protected customer data access required"
                            ) {
                              const message = `🔒 Protected Customer Data Access Required

${data.message}

📋 To fix this:
${data.solution.step1}
${data.solution.step2}
${data.solution.step3}
${data.solution.step4}
${data.solution.step5}
${data.solution.step6}
${data.solution.step7}

📖 Documentation: ${data.documentation}

🔍 For testing now:
${data.fallback.message}
${data.fallback.instructions.join("\n")}

Configured PFC tag: ${data.fallback.configuredTag}
Discount enabled: ${data.fallback.discountSettings.isEnabled ? "Yes" : "No"}
Discount percent: ${data.fallback.discountSettings.discountPercent}%`;
                              alert(message);
                            } else {
                              alert(
                                `Error: ${data.error}\n\n${data.message || ""}`,
                              );
                            }
                          } else {
                            alert(
                              `✅ SUCCESS! Customer Test Results:

👤 Customer: ${data.customer?.firstName} ${data.customer?.lastName}
📧 Email: ${data.customer?.email}
🏷️ PFC Member: ${data.isPfcMember ? "✅ YES" : "❌ NO"}
🏷️ Tags: ${data.allTags?.join(", ") || "None"}
🎯 Configured Tag: ${data.configuredTag}
💰 Discount Enabled: ${data.discountSettings.isEnabled ? "✅ Yes" : "❌ No"}
💸 Discount Percent: ${data.discountSettings.discountPercent}%

🎉 This customer ${data.isPfcMember ? "WILL" : "WILL NOT"} receive the PFC discount!`,
                            );
                          }
                        } catch (error) {
                          console.error("Test failed:", error);
                          alert("Test failed. Check console for details.");
                        }
                      }}
                    >
                      Test My Customer (ID: 9304638554387)
                    </Button>

                    <Text as="p" variant="bodyMd" tone="subdued">
                      <strong>Note:</strong> This app may require{" "}
                      <a
                        href="https://shopify.dev/docs/apps/launch/protected-customer-data"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        protected customer data access
                      </a>{" "}
                      to read customer information. If you see an error, follow
                      the instructions to request access.
                    </Text>

                    <Banner tone="warning">
                      <p>
                        <strong>🚨 Important:</strong> This app can currently{" "}
                        <strong>detect</strong> PFC members, but{" "}
                        <strong>cannot apply discounts</strong> at checkout yet.
                      </p>
                      <p>
                        To actually apply discounts, you need to implement{" "}
                        <strong>Shopify App Extensions</strong>:
                      </p>
                      <ul>
                        <li>
                          <strong>✅ Cart Transform Function:</strong> Created -
                          applies discounts at checkout
                        </li>
                        <li>
                          <strong>⏳ Storefront App Extension:</strong> Shows
                          discounted prices on product pages
                        </li>
                        <li>
                          <strong>⏳ Checkout UI Extension:</strong> Customizes
                          the checkout experience
                        </li>
                      </ul>
                      <p>
                        <strong>Next Steps:</strong>
                      </p>
                      <ol>
                        <li>
                          Deploy the cart transform function:{" "}
                          <code>shopify app deploy</code>
                        </li>
                        <li>Enable the function in your Shopify admin</li>
                        <li>Test with a PFC member customer</li>
                      </ol>
                    </Banner>

                    <Text as="h4" variant="headingSm">
                      How to Find Your Customer ID
                    </Text>
                    <Text as="p" variant="bodyMd">
                      1. Go to your Shopify admin:{" "}
                      <strong>shop-etee.myshopify.com/admin</strong>
                    </Text>
                    <Text as="p" variant="bodyMd">
                      2. Navigate to <strong>Customers</strong> in the left
                      sidebar
                    </Text>
                    <Text as="p" variant="bodyMd">
                      3. Find your customer account (the one tagged with
                      PFC_member)
                    </Text>
                    <Text as="p" variant="bodyMd">
                      4. Click on your customer name
                    </Text>
                    <Text as="p" variant="bodyMd">
                      5. Look at the URL - it will show:{" "}
                      <code>
                        https://shop-etee.myshopify.com/admin/customers/CUSTOMER_ID
                      </code>
                    </Text>
                    <Text as="p" variant="bodyMd">
                      6. Copy the <strong>CUSTOMER_ID</strong> number from the
                      URL
                    </Text>

                    <Text as="h4" variant="headingSm">
                      Sample Products (for testing)
                    </Text>
                    {debugInfo.sampleProducts.slice(0, 2).map((product) => (
                      <div key={product.id}>
                        <Text as="p" variant="bodyMd">
                          <strong>{product.title}</strong> (ID:{" "}
                          {product.id.replace("gid://shopify/Product/", "")})
                        </Text>
                        {product.variants.slice(0, 1).map((variant) => (
                          <Text
                            as="p"
                            variant="bodyMd"
                            tone="subdued"
                            key={variant.id}
                          >
                            • Variant:{" "}
                            {variant.id.replace(
                              "gid://shopify/ProductVariant/",
                              "",
                            )}{" "}
                            - ${variant.price}
                            {variant.compareAtPrice &&
                              ` (Compare: $${variant.compareAtPrice})`}
                          </Text>
                        ))}
                      </div>
                    ))}

                    <Text as="h4" variant="headingSm">
                      Sample Customers (for testing)
                    </Text>
                    {debugInfo.sampleCustomers.slice(0, 3).map((customer) => (
                      <div key={customer.id}>
                        <Text as="p" variant="bodyMd">
                          <strong>
                            {customer.firstName} {customer.lastName}
                          </strong>{" "}
                          (ID: {customer.id}) - {customer.email}
                        </Text>
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Tags:{" "}
                          {customer.tags.length > 0
                            ? customer.tags.join(", ")
                            : "None"}
                          {customer.tags.some(
                            (tag: string) =>
                              tag.trim().toLowerCase() ===
                              selectedTag.trim().toLowerCase(),
                          ) && " ✅ PFC Member"}
                        </Text>
                      </div>
                    ))}

                    <Text as="p" variant="bodyMd" tone="subdued">
                      Dynamic pricing calculated in real-time for PFC members
                      only. Original prices remain unchanged in Shopify.
                    </Text>
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
