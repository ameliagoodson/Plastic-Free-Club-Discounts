interface CartTransformInput {
  cart: {
    lines: Array<{
      id: string;
      merchandise: {
        id: string;
        product: {
          id: string;
        };
        variant: {
          id: string;
          price: {
            amount: string;
          };
          compareAtPrice?: {
            amount: string;
          };
        };
      };
      cost: {
        subtotalAmount: {
          amount: string;
        };
      };
    }>;
    buyerIdentity?: {
      customer?: {
        id: string;
        tags?: string[];
      };
    };
  };
}

interface CartTransformOutput {
  cart: {
    lines: Array<{
      id: string;
      cost: {
        subtotalAmount: {
          amount: string;
        };
      };
      attributes?: Array<{
        key: string;
        value: string;
      }>;
    }>;
  };
}

// Default PFC settings - these should be configured via environment variables
const DEFAULT_PFC_SETTINGS = {
  isEnabled: true,
  discountPercent: 10,
  pfcMemberTag: "plastic-free-club"
};

// Helper function to get discount settings
function getDiscountSettings(): {
  isEnabled: boolean;
  discountPercent: number;
  pfcMemberTag: string;
} {
  // Guard against process not being defined in the Shopify Functions runtime
  const hasProcessEnv = typeof process !== "undefined" && (process as any).env;
  const env = hasProcessEnv ? (process as any).env : {} as Record<string, string>;

  const pfcTag = env.PFC_MEMBER_TAG || DEFAULT_PFC_SETTINGS.pfcMemberTag;
  const discountPercent = parseFloat(env.PFC_DISCOUNT_PERCENT || DEFAULT_PFC_SETTINGS.discountPercent.toString());
  const isEnabled = (env.PFC_DISCOUNT_ENABLED ?? "true") !== "false"; // Default to true unless explicitly disabled
  
  return {
    isEnabled,
    discountPercent,
    pfcMemberTag: pfcTag
  };
}

export const run = async (input: CartTransformInput): Promise<CartTransformOutput> => {
  const { cart } = input;
  
  // Check if customer is logged in
  if (!cart.buyerIdentity?.customer?.id) {
    return { cart: { lines: cart.lines.map(line => ({ id: line.id, cost: line.cost })) } };
  }

  const customerTags = cart.buyerIdentity.customer.tags || [];
  
  try {
    // Get discount settings
    const settings = getDiscountSettings();
    
    // Check if customer is PFC member by looking at their tags
    const isPfcMember = customerTags.some(tag => 
      tag.toLowerCase().trim() === settings.pfcMemberTag.toLowerCase().trim()
    );
    
    if (!isPfcMember || !settings.isEnabled || settings.discountPercent <= 0) {
      return { cart: { lines: cart.lines.map(line => ({ id: line.id, cost: line.cost })) } };
    }

    // Apply discount to cart lines
    const updatedLines = cart.lines.map((line: any) => {
      const originalPrice = parseFloat(line.merchandise.variant.price.amount);
      const compareAtPrice = line.merchandise.variant.compareAtPrice?.amount 
        ? parseFloat(line.merchandise.variant.compareAtPrice.amount) 
        : null;
      
      let discountedPrice = originalPrice;
      
      if (settings.discountPercent > 0) {
        if (compareAtPrice && compareAtPrice > 0) {
          // Calculate discount from compare-at-price (preferred)
          discountedPrice = compareAtPrice * (1 - settings.discountPercent / 100);
        } else {
          // Calculate discount from original price
          discountedPrice = originalPrice * (1 - settings.discountPercent / 100);
        }
      }

      return {
        id: line.id,
        cost: {
          subtotalAmount: {
            amount: discountedPrice.toFixed(2)
          }
        },
        attributes: [
          {
            key: "pfc_discount_applied",
            value: "true"
          },
          {
            key: "pfc_discount_percent",
            value: settings.discountPercent.toString()
          },
          {
            key: "original_price",
            value: originalPrice.toFixed(2)
          },
          {
            key: "pfc_member",
            value: "true"
          }
        ]
      };
    });

    return {
      cart: {
        lines: updatedLines
      }
    };

  } catch (error) {
    console.error("Error applying PFC discount:", error);
    return { cart: { lines: cart.lines.map(line => ({ id: line.id, cost: line.cost })) } };
  }
};
