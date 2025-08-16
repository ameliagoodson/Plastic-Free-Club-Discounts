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
  pfcMemberTag?: string;
};

export function run(input: RunInput): FunctionRunResult {
  const configuration: Configuration = JSON.parse(
    input?.discountNode?.metafield?.value ?? "{}"
  );

  const enabled = Boolean(configuration.enabled ?? true);
  const customerIsMember = Boolean(input.cart.buyerIdentity?.customer?.hasAnyTag);

  // Debug logging
  console.error("=== SHIPPING DISCOUNT DEBUG ===");
  console.error("Configuration:", configuration);
  console.error("Enabled:", enabled);
  console.error("Customer is member:", customerIsMember);
  console.error("Raw metafield value:", input?.discountNode?.metafield?.value);

  if (!customerIsMember || !enabled) {
    console.error("Returning empty - customerIsMember:", customerIsMember, "enabled:", enabled);
    return EMPTY_DISCOUNT;
  }

  // Build targets for each available delivery option
  const targets: Target[] = [];
  const groups = input.cart.deliveryGroups ?? [];
  for (const group of groups) {
    const options = group.deliveryOptions ?? [];
    for (const opt of options) {
      if (opt?.handle) {
        targets.push({
          deliveryOption: { handle: opt.handle }
        });
      }
    }
  }

  if (targets.length === 0) {
    console.error("No delivery targets found, returning empty");
    return EMPTY_DISCOUNT;
  }

  const discounts: Discount[] = [
    {
      message: "Free Shipping for PFC Members",
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