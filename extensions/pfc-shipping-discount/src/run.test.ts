import { describe, it, expect } from 'vitest';
import { run } from './run';
import { FunctionResult, DiscountApplicationStrategy } from '../generated/api';

describe('shipping discounts function', () => {
  it('returns no discounts without configuration', () => {
    const result = run({
      discountNode: {
        metafield: null
      },
      cart: {
        buyerIdentity: {
          customer: {
            hasAnyTag: false
          }
        }
      }
    });
    const expected: FunctionResult = {
      discounts: [],
    };

    expect(result).toEqual(expected);
  });

  it('uses custom shipping message when provided in configuration', () => {
    const result = run({
      discountNode: {
        metafield: {
          value: JSON.stringify({
            enabled: true,
            shippingDiscountMessage: 'Custom Free Shipping Message'
          })
        }
      },
      cart: {
        buyerIdentity: {
          customer: {
            hasAnyTag: true
          }
        },
        deliveryGroups: [{
          deliveryOptions: [{
            handle: 'standard-shipping'
          }]
        }]
      }
    });

    expect(result.discounts).toHaveLength(1);
    expect(result.discounts[0].message).toBe('Custom Free Shipping Message');
    expect(result.discounts[0].value.percentage?.value).toBe(100);
  });
});