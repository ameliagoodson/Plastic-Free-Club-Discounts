import db from "../db.server";

// This function is now DEPRECATED - we're using dynamic pricing instead
// Keeping it for backward compatibility but it should not be used
export async function applyDiscountsToAllProducts(
  admin: any, 
  shop: string
): Promise<{ success: boolean; message: string; updatedCount: number }> {
  return {
    success: false,
    message: "This function is deprecated. Use dynamic pricing instead - prices should not be permanently modified.",
    updatedCount: 0
  };
}

// New function for dynamic pricing calculation
export async function calculateDynamicPrice(
  shop: string,
  customerId: string,
  productId: string,
  variantId: string,
  admin: any
): Promise<{
  isPfcMember: boolean;
  discountPercent: number;
  isEnabled: boolean;
  memberPrice?: string;
  originalPrice: string;
  compareAtPrice?: string;
}> {
  try {
    // Get discount settings
    const settings = await db.discountSettings.findUnique({
      where: { shop }
    });

    if (!settings || !settings.isEnabled) {
      return {
        isPfcMember: false,
        discountPercent: 0,
        isEnabled: false,
        originalPrice: "0.00"
      };
    }

    // Check if customer is PFC member using the configured tag
    const customerResponse = await admin.graphql(`
      query getCustomer($customerId: ID!) {
        customer(id: $customerId) {
          id
          tags
        }
      }
    `, {
      variables: { customerId: `gid://shopify/Customer/${customerId}` }
    });

    const customerData = await customerResponse.json();
    const customer = customerData.data?.customer;
    const customerTags = customer?.tags || [];
    const configuredTag = (settings as any).pfcMemberTag || "PFC_member";
    
    // Case-insensitive and whitespace-trimmed comparison
    const isPfcMember = customerTags.some((tag: string) => 
      tag.trim().toLowerCase() === configuredTag.trim().toLowerCase()
    );

    // Get product variant pricing
    const productResponse = await admin.graphql(`
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
    `, {
      variables: { 
        productId: `gid://shopify/Product/${productId}`,
        variantId: `gid://shopify/ProductVariant/${variantId}`
      }
    });

    const productData = await productResponse.json();
    const variant = productData.data?.product?.variants?.edges?.find(
      (edge: any) => edge.node.id === `gid://shopify/ProductVariant/${variantId}`
    )?.node;

    if (!variant) {
      throw new Error("Product variant not found");
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

    return {
      isPfcMember,
      discountPercent: settings.discountPercent,
      isEnabled: settings.isEnabled,
      memberPrice,
      originalPrice,
      compareAtPrice
    };

  } catch (error) {
    console.error('Error calculating dynamic price:', error);
    throw error;
  }
}

// Helper function to calculate member price from compare-at-price
export function calculateMemberPrice(
  compareAtPrice: string | null | undefined,
  discountPercent: number
): string | null {
  // Only calculate member price if compare-at-price exists
  if (!compareAtPrice || parseFloat(compareAtPrice) <= 0) {
    return null; // Skip products without compare-at-price
  }

  const discount = discountPercent / 100;
  const compareAtPriceNum = parseFloat(compareAtPrice);
  const memberPrice = compareAtPriceNum * (1 - discount);
  
  return memberPrice.toFixed(2);
} 