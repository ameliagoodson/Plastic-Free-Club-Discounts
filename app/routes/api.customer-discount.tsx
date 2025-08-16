import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

type CustomerDiscountResponse = {
  isPfcMember: boolean;
  discountPercent: number;
  isEnabled: boolean;
  memberPrice?: string;
  originalPrice: string;
  compareAtPrice?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  const productId = url.searchParams.get("productId");
  const variantId = url.searchParams.get("variantId");

  if (!customerId || !productId || !variantId) {
    return json({ error: "Missing required parameters" }, { status: 400 });
  }

  try {
    const { session, admin } = await authenticate.admin(request);

    // Get discount settings
    const settings = await db.discountSettings.findUnique({
      where: { shop: session.shop },
    });

    if (!settings || !settings.isEnabled) {
      return json({
        isPfcMember: false,
        discountPercent: 0,
        isEnabled: false,
        originalPrice: "0.00",
      });
    }

    // Check if customer is PFC member
    const customerResponse = await admin.graphql(
      `
      query getCustomer($customerId: ID!) {
        customer(id: $customerId) {
          id
          tags
        }
      }
    `,
      {
        variables: { customerId: `gid://shopify/Customer/${customerId}` },
      },
    );

    const customerData = await customerResponse.json();
    const customer = customerData.data?.customer;
    const customerTags = customer?.tags || [];
    const configuredTag = (settings as any).pfcMemberTag || "PFC_member";

    // Case-insensitive and whitespace-trimmed comparison
    const isPfcMember = customerTags.some(
      (tag: string) =>
        tag.trim().toLowerCase() === configuredTag.trim().toLowerCase(),
    );

    // Get product variant pricing
    const productResponse = await admin.graphql(
      `
      query getProductVariant($productId: ID!, $variantId: ID!) {
        product(id: $productId) {
          variants(first: 10) {
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
    `,
      {
        variables: {
          productId: `gid://shopify/Product/${productId}`,
          variantId: `gid://shopify/ProductVariant/${variantId}`,
        },
      },
    );

    const productData = await productResponse.json();
    const variant = productData.data?.product?.variants?.edges?.find(
      (edge: any) =>
        edge.node.id === `gid://shopify/ProductVariant/${variantId}`,
    )?.node;

    if (!variant) {
      return json({ error: "Product variant not found" }, { status: 404 });
    }

    const originalPrice = variant.price;
    const compareAtPrice = variant.compareAtPrice;

    // Calculate member price if applicable
    let memberPrice: string | undefined;

    if (isPfcMember && settings.discountPercent > 0) {
      if (compareAtPrice && parseFloat(compareAtPrice) > 0) {
        // Calculate from compare-at-price (preferred)
        const discount = settings.discountPercent / 100;
        const compareAtPriceNum = parseFloat(compareAtPrice);
        memberPrice = (compareAtPriceNum * (1 - discount)).toFixed(2);
      } else if (originalPrice && parseFloat(originalPrice) > 0) {
        // Fallback to original price if no compare-at-price
        const discount = settings.discountPercent / 100;
        const originalPriceNum = parseFloat(originalPrice);
        memberPrice = (originalPriceNum * (1 - discount)).toFixed(2);
      }
    }

    const response: CustomerDiscountResponse = {
      isPfcMember,
      discountPercent: settings.discountPercent,
      isEnabled: settings.isEnabled,
      memberPrice,
      originalPrice,
      compareAtPrice,
    };

    return json(response);
  } catch (error) {
    console.error("Error in customer discount API:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
