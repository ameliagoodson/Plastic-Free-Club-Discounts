import type {
  RunInput,
  FunctionRunResult,
  Discount,
  Target,
} from "../generated/api";
import {
  DiscountApplicationStrategy,
} from "../generated/api";

const EMPTY: FunctionRunResult = {
  discountApplicationStrategy: DiscountApplicationStrategy.Maximum,
  discounts: [],
};

type Configuration = {
  percentage?: number;
  freeShipping?: boolean;
};

export function run(input: RunInput): FunctionRunResult {
  const configuration: Configuration = JSON.parse(
    input?.discountNode?.metafield?.value ?? "{}"
  );

  const percent = Math.max(
    0,
    Math.min(100, Number(configuration.percentage ?? 10))
  );
  
  const freeShipping = Boolean(configuration.freeShipping ?? true); // Default to true

  const customerIsMember = Boolean(
    input.cart.buyerIdentity?.customer?.hasAnyTag
  );

  // Debug logging (these will show in function logs)
  console.error("DEBUG - Configuration:", JSON.stringify(configuration));
  console.error("DEBUG - Percent:", percent);
  console.error("DEBUG - Free shipping:", freeShipping);
  console.error("DEBUG - Customer is member:", customerIsMember);

  if (!customerIsMember) return EMPTY;

  const discounts: Discount[] = [];

  // Add product discounts (if percentage > 0)
  if (percent > 0) {
    for (const line of input.cart.lines) {
      const regular = Number(line.cost.amountPerQuantity.amount);
      const compareAt = line.cost.compareAtAmountPerQuantity?.amount
        ? Number(line.cost.compareAtAmountPerQuantity.amount)
        : undefined;

      const base = compareAt && compareAt > 0 ? compareAt : regular;
      if (!base || base <= 0) continue;

      // Shopify expects percentage values from 0-100, not 0-1 decimal format
      const value = percent;

      console.error("DEBUG - Line amount:", regular);
      console.error("DEBUG - Compare at:", compareAt);
      console.error("DEBUG - Base price:", base);
      console.error("DEBUG - Product discount percentage:", value);

      discounts.push({
        message: "PFC Member Discount",
        targets: [
          {
            productVariant: {
              id: (line.merchandise as any).id,
              quantity: line.quantity,
            },
          } as Target,
        ],
        value: { percentage: { value } },
      });
    }
  }

  // Note: For true free shipping, we'll need to create a separate shipping discount function
  // This order discount function can only discount products, not shipping directly
  // But we'll log this for the admin to know the feature is configured
  if (freeShipping) {
    console.error("DEBUG - Free shipping is enabled in configuration");
    console.error("DEBUG - Note: Create a separate shipping discount for true free shipping");
    // TODO: Implement separate shipping discount function for free shipping
  }

  return {
    discountApplicationStrategy: DiscountApplicationStrategy.Maximum,
    discounts,
  };
}