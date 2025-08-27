import type {
  RunInput,
  FunctionRunResult,
  Discount,
  Target
} from "../generated/api";

const EMPTY_DISCOUNT: FunctionRunResult = {
  discounts: [],
};

type Configuration = {
  enabled?: boolean;
  productDiscountMessage?: string;
  shippingDiscountMessage?: string;
};

export function run(input: RunInput): FunctionRunResult {
  // Debug the input first
  console.error("=== SHIPPING DISCOUNT DEBUG START ===");
  console.error("Input discount node:", input?.discountNode);
  console.error("Input metafield:", input?.discountNode?.metafield);
  console.error("Raw metafield value:", input?.discountNode?.metafield?.value);
  console.error("Cart buyer identity:", input.cart.buyerIdentity);
  console.error("Customer hasAnyTag:", input.cart.buyerIdentity?.customer?.hasAnyTag);

  const configuration: Configuration = JSON.parse(
    input?.discountNode?.metafield?.value ?? "{}"
  );

  // If no configuration metafield exists, default to enabled for testing
  const enabled = configuration.enabled !== undefined ? Boolean(configuration.enabled) : true;
  
  // The GraphQL query checks for hasAnyTag with hardcoded "PFC_member" 
  // This should be true if the customer has the PFC_member tag
  const customerIsMember = Boolean(input.cart.buyerIdentity?.customer?.hasAnyTag);

  console.error("Parsed configuration:", configuration);
  console.error("Enabled:", enabled);
  console.error("Customer is member:", customerIsMember);

  if (!customerIsMember) {
    console.error("Returning empty - customer is not a member");
    return EMPTY_DISCOUNT;
  }

  if (!enabled) {
    console.error("Returning empty - shipping discount is disabled");
    return EMPTY_DISCOUNT;
  }

  // Build targets for each available delivery option
  console.error("Delivery groups:", JSON.stringify(input.cart.deliveryGroups, null, 2));
  
  const targets: Target[] = [];
  const groups = input.cart.deliveryGroups ?? [];
  
  console.error("Number of delivery groups:", groups.length);
  
  for (const group of groups) {
    const options = group.deliveryOptions ?? [];
    console.error("Delivery options for group:", JSON.stringify(options, null, 2));
    
    for (const opt of options) {
      console.error("Processing delivery option:", opt);
      if (opt?.handle) {
        console.error("Adding target for handle:", opt.handle);
        targets.push({
          deliveryOption: { handle: opt.handle }
        });
      } else {
        console.error("Skipping option - no handle:", opt);
      }
    }
  }

  console.error("Total targets found:", targets.length);
  console.error("Targets:", JSON.stringify(targets, null, 2));

  if (targets.length === 0) {
    console.error("No delivery targets found, returning empty");
    return EMPTY_DISCOUNT;
  }

  const customMessage = configuration.shippingDiscountMessage || "Free Shipping for PFC Members";
  
  const discounts: Discount[] = [
    {
      message: customMessage,
      targets,
      value: {
        percentage: {
          value: 100
        }
      }
    }
  ];

  console.error("Returning free shipping discount with", targets.length, "targets");
  return { discounts };
}