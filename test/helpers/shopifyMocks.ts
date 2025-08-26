// Test helpers for creating proper Shopify API types
import type { CurrencyCode } from '../../extensions/pfc-member-order-discount/generated/api'

export function createCartLine(params: {
  id: string
  quantity: number
  currentPrice: string
  compareAtPrice?: string | null
  currencyCode?: CurrencyCode
}) {
  const currency = params.currencyCode || 'USD' as CurrencyCode
  
  return {
    id: `line-${params.id}`, // Add the required id field
    quantity: params.quantity,
    cost: {
      amountPerQuantity: {
        amount: params.currentPrice,
        currencyCode: currency,
        __typename: 'MoneyV2' as const
      },
      compareAtAmountPerQuantity: params.compareAtPrice ? {
        amount: params.compareAtPrice,
        currencyCode: currency,
        __typename: 'MoneyV2' as const
      } : null
    },
    merchandise: {
      id: params.id,
      __typename: 'ProductVariant' as const
    },
    __typename: 'CartLine' as const
  }
}

export function createCart(params: {
  isCustomerMember: boolean
  lines: ReturnType<typeof createCartLine>[]
}) {
  return {
    buyerIdentity: {
      customer: {
        hasAnyTag: params.isCustomerMember,
        __typename: 'Customer' as const
      },
      __typename: 'BuyerIdentity' as const
    },
    lines: params.lines,
    deliveryGroups: [], // Required by the API but not used in our function
    __typename: 'Cart' as const
  }
}

export function createDiscountNode(percentage: number) {
  return {
    metafield: {
      value: JSON.stringify({ percentage }),
      __typename: 'Metafield' as const
    },
    __typename: 'DiscountAutomaticNode' as const
  }
}