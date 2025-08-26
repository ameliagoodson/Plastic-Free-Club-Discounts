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

  // Use the configured percentage, no hardcoded default
  const percent = Math.max(
    0,
    Math.min(100, Number(configuration.percentage ?? 0))
  );
  
  const freeShipping = Boolean(configuration.freeShipping ?? false); // Default to false

  const customerIsMember = Boolean(
    input.cart.buyerIdentity?.customer?.hasAnyTag
  );

  // Debug logging (these will show in function logs)
  console.error("=== PRODUCT DISCOUNT DEBUG ===");
  console.error("DEBUG - Configuration:", JSON.stringify(configuration));
  console.error("DEBUG - Configured percent:", percent);
  console.error("DEBUG - Free shipping:", freeShipping);
  console.error("DEBUG - Customer is member:", customerIsMember);
  console.error("DEBUG - Raw metafield value:", input?.discountNode?.metafield?.value);

  if (!customerIsMember) {
    console.error("DEBUG - Customer is not a member, returning empty");
    return EMPTY;
  }

  if (percent <= 0) {
    console.error("DEBUG - Percentage is 0 or negative, returning empty");
    return EMPTY;
  }

  const discounts: Discount[] = [];

  // Add product discounts - calculate fixed amount based on compare-at-price
  for (const line of input.cart.lines) {
    const regular = Number(line.cost.amountPerQuantity.amount);
    const compareAt = line.cost.compareAtAmountPerQuantity?.amount
      ? Number(line.cost.compareAtAmountPerQuantity.amount)
      : undefined;

    console.error("DEBUG - Processing line - regularPrice:", regular);
    console.error("DEBUG - Processing line - compareAtPrice:", compareAt);
    console.error("DEBUG - Processing line - hasCompareAt:", !!compareAt && compareAt > 0);
    console.error("DEBUG - Processing line - merchandiseId:", (line.merchandise as any).id);

    // Only apply discount if there's a compare-at-price
    if (!compareAt || compareAt <= 0) {
      console.error("DEBUG - Skipping line - no compare-at-price");
      continue;
    }

    // Calculate target price from compare-at-price
    const discountDecimal = percent / 100; // Convert percentage to decimal
    const targetPrice = compareAt * (1 - discountDecimal);

    console.error("DEBUG - Calculation - compareAtPrice:", compareAt);
    console.error("DEBUG - Calculation - discountPercent:", percent);
    console.error("DEBUG - Calculation - targetPrice:", targetPrice);
    console.error("DEBUG - Calculation - currentPrice:", regular);

    // Calculate the discount amount (how much to reduce the current price)
    // Shopify discounts can only REDUCE prices, never increase them
    const discountAmount = regular - targetPrice;

    console.error("DEBUG - Calculation - discountAmount:", discountAmount);

    // Only apply discount if it would reduce the price (best price wins automatically)
    if (discountAmount <= 0) {
      console.error("DEBUG - Skipping line - PFC price ($" + targetPrice + ") is not better than current price ($" + regular + ")");
      console.error("DEBUG - Note: Best price wins automatically - Shopify discounts can only reduce prices");
      continue;
    }

    discounts.push({
      message: `PFC Member Discount (${percent}% off compare-at-price)`,
      targets: [
        {
          productVariant: {
            id: (line.merchandise as any).id,
            quantity: line.quantity,
          },
        } as Target,
      ],
      value: { 
        fixedAmount: { 
          amount: discountAmount.toFixed(2) 
        } 
      },
    });
  }

  // Note: For true free shipping, we'll need to create a separate shipping discount function
  // This order discount function can only discount products, not shipping directly
  // But we'll log this for the admin to know the feature is configured
  if (freeShipping) {
    console.error("DEBUG - Free shipping is enabled in configuration");
    console.error("DEBUG - Note: Create a separate shipping discount for true free shipping");
    // TODO: Implement separate shipping discount function for free shipping
  }

  console.error("DEBUG - Final result - discounts count:", discounts.length);
  console.error("DEBUG - Final result - total discount amounts:");
  let totalDiscount = 0;
  discounts.forEach((discount, index) => {
    const amount = parseFloat(discount.value.fixedAmount?.amount || "0");
    totalDiscount += amount;
    console.error(`DEBUG - Discount ${index + 1}: $${amount} for ${discount.targets[0]?.productVariant?.id}`);
  });
  console.error("DEBUG - Final result - total expected discount: $" + totalDiscount.toFixed(2));
  
  return {
    discountApplicationStrategy: DiscountApplicationStrategy.Maximum,
    discounts,
  };
}