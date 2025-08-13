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
    pfcMemberTag: string;
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
          freeShippingEnabled: false,
          pfcMemberTag: "plastic-free-club",
          productDiscountId: null,
          shippingDiscountId: null,
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
        freeShippingEnabled: false,
        pfcMemberTag: "plastic-free-club",
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
      availableTags: ["plastic-free-club"],
    });
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action") as string;

  if (actionType === "createDiscount") {
    console.log("=== CONFIGURING EXISTING DISCOUNTS ===");
    console.log("Looking for existing PFC discounts to configure");

    try {
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

      const productId: string | null = discountSettings.productDiscountId;
      const shippingId: string | null = discountSettings.shippingDiscountId;

      if (!productId && !shippingId) {
        return json({
          success: false,
          error:
            "No discount IDs set. Paste the DiscountAutomaticNode IDs into the settings and Save, then click Configure.",
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

      if (
        productId &&
        discountSettings.isEnabled &&
        discountSettings.discountPercent > 0
      ) {
        metafields.push({
          ownerId: productId,
          namespace: "$app:pfc-member-order-discount",
          key: "function-configuration",
          type: "json",
          value: JSON.stringify({
            percentage: discountSettings.discountPercent,
          }),
        });
      }

      if (shippingId) {
        metafields.push({
          ownerId: shippingId,
          namespace: "$app:pfc-shipping-discount",
          key: "function-configuration",
          type: "json",
          value: JSON.stringify({
            enabled: !!discountSettings.freeShippingEnabled,
            pfcMemberTag: discountSettings.pfcMemberTag,
          }),
        });
      }

      if (metafields.length === 0) {
        return json({
          success: false,
          error:
            "Nothing to configure. Enable the discount and/or free shipping, then click Configure.",
          action: "createDiscount",
        } as ActionData);
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
        message: `Configured PFC discounts successfully${productId ? " (product)" : ""}${shippingId ? " (shipping)" : ""}.`,
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

  // Default action: update settings
  const discountPercent = parseFloat(formData.get("discountPercent") as string);
  const isEnabled = formData.get("isEnabled") === "true";
  const freeShippingEnabled = formData.get("freeShippingEnabled") === "true";
  const pfcMemberTag = formData.get("pfcMemberTag") as string;
  const productDiscountId =
    (formData.get("productDiscountId") as string) || null;
  const shippingDiscountId =
    (formData.get("shippingDiscountId") as string) || null;

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
      freeShippingEnabled,
      pfcMemberTag: pfcMemberTag.trim(),
      productDiscountId,
      shippingDiscountId,
    },
    create: {
      shop: session.shop,
      discountPercent,
      isEnabled,
      freeShippingEnabled,
      pfcMemberTag: pfcMemberTag.trim(),
      productDiscountId,
      shippingDiscountId,
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
  const [freeShippingEnabled, setFreeShippingEnabled] = useState(
    discountSettings.freeShippingEnabled || false,
  );
  const [selectedTag, setSelectedTag] = useState(discountSettings.pfcMemberTag);
  const [productDiscountId, setProductDiscountId] = useState(
    discountSettings.productDiscountId || "",
  );
  const [shippingDiscountId, setShippingDiscountId] = useState(
    discountSettings.shippingDiscountId || "",
  );
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
    formData.append("freeShippingEnabled", freeShippingEnabled.toString());
    formData.append("pfcMemberTag", selectedTag);
    formData.append("productDiscountId", productDiscountId.trim());
    formData.append("shippingDiscountId", shippingDiscountId.trim());
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

                  <TextField
                    label="Product Discount ID (DiscountAutomaticNode gid)"
                    value={productDiscountId}
                    onChange={setProductDiscountId}
                    helpText="Paste the gid returned by GraphiQL, e.g. gid://shopify/DiscountAutomaticNode/1528..."
                    autoComplete="off"
                  />

                  <TextField
                    label="Shipping Discount ID (DiscountAutomaticNode gid)"
                    value={shippingDiscountId}
                    onChange={setShippingDiscountId}
                    helpText="Paste the gid returned by GraphiQL for the shipping discount"
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

                  <Checkbox
                    label="Enable free shipping"
                    checked={freeShippingEnabled}
                    onChange={setFreeShippingEnabled}
                    helpText={`Free shipping is currently ${freeShippingEnabled ? "ACTIVE" : "DISABLED"} for PFC members`}
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
                    {enabled &&
                    percentage &&
                    parseFloat(percentage) > 0 &&
                    freeShippingEnabled
                      ? "Configure PFC Discounts (% + Free Shipping)"
                      : enabled && percentage && parseFloat(percentage) > 0
                        ? "Configure PFC Product Discount"
                        : freeShippingEnabled
                          ? "Configure PFC Free Shipping"
                          : "Configure PFC Discounts"}
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
