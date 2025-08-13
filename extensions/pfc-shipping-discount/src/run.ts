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

  if (!customerIsMember || !enabled) {
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

  return { discounts };
}