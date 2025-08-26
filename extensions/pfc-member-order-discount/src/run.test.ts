import { describe, it, expect, beforeEach, vi } from 'vitest';
import { run } from './run';
import { FunctionResult, DiscountApplicationStrategy } from '../generated/api';
import { createCart, createCartLine, createDiscountNode } from '../../../test/helpers/shopifyMocks';

describe('PFC Member Order Discount Function', () => {
  beforeEach(() => {
    // Clear console mocks before each test
    vi.clearAllMocks();
  });

  describe('Configuration and setup', () => {
    it('returns no discounts without configuration', () => {
      const result = run({
        discountNode: { metafield: null },
        cart: createCart({ isCustomerMember: false, lines: [] })
      });
      
      const expected: FunctionResult = {
        discounts: [],
        discountApplicationStrategy: DiscountApplicationStrategy.Maximum,
      };

      expect(result).toEqual(expected);
    });

    it('returns no discounts when customer is not a member', () => {
      const line = createCartLine({
        id: 'gid://shopify/ProductVariant/123',
        quantity: 1,
        currentPrice: '20.00',
        compareAtPrice: '25.00'
      });

      const result = run({
        discountNode: createDiscountNode(10),
        cart: createCart({ isCustomerMember: false, lines: [line] })
      });

      expect(result.discounts).toHaveLength(0);
    });

    it('returns no discounts when percentage is 0', () => {
      const line = createCartLine({
        id: 'gid://shopify/ProductVariant/123',
        quantity: 1,
        currentPrice: '20.00',
        compareAtPrice: '25.00'
      });

      const result = run({
        discountNode: createDiscountNode(0),
        cart: createCart({ isCustomerMember: true, lines: [line] })
      });

      expect(result.discounts).toHaveLength(0);
    });
  });

  describe('Single product discount calculation', () => {
    it('applies discount correctly for single product with compare-at-price', () => {
      const line = createCartLine({
        id: 'gid://shopify/ProductVariant/123',
        quantity: 1,
        currentPrice: '20.00', // Current price
        compareAtPrice: '25.00' // Compare-at price
      });

      const result = run({
        discountNode: createDiscountNode(10),
        cart: createCart({ isCustomerMember: true, lines: [line] })
      });

      expect(result.discounts).toHaveLength(1);
      expect(result.discounts[0]).toEqual({
        message: 'PFC Member Discount (10% off compare-at-price)',
        targets: [{
          productVariant: {
            id: 'gid://shopify/ProductVariant/123',
            quantity: 1
          }
        }],
        value: {
          fixedAmount: {
            amount: '2.50' // $20 - ($25 * 0.9) = $20 - $22.50 = -$2.50, but we want positive discount amount
          }
        }
      });
    });

    it('skips products without compare-at-price', () => {
      const line = createCartLine({
        id: 'gid://shopify/ProductVariant/123',
        quantity: 1,
        currentPrice: '20.00',
        compareAtPrice: null
      });

      const result = run({
        discountNode: createDiscountNode(10),
        cart: createCart({ isCustomerMember: true, lines: [line] })
      });

      expect(result.discounts).toHaveLength(0);
    });

    it('implements "best price wins" - skips when PFC price is not better', () => {
      const line = createCartLine({
        id: 'gid://shopify/ProductVariant/123',
        quantity: 1,
        currentPrice: '8.00', // Already cheaper than PFC price
        compareAtPrice: '10.00' // 10% off = $9
      });

      const result = run({
        discountNode: createDiscountNode(10),
        cart: createCart({ isCustomerMember: true, lines: [line] })
      });

      // Should not apply discount because retail ($8) is better than PFC ($9)
      expect(result.discounts).toHaveLength(0);
    });
  });

  describe('Multi-product cart scenarios - YOUR BUG TESTING', () => {
    it('should correctly calculate discounts for your ACTUAL 3-product scenario - DEBUGGING REAL ISSUE', () => {
      const lines = [
        // Product 1: Moisturizer - $34 retail = $34 compare-at
        createCartLine({
          id: 'gid://shopify/ProductVariant/moisturizer',
          quantity: 1,
          currentPrice: '34.00',
          compareAtPrice: '34.00'
        }),
        // Product 2: Lip balm - $8 retail, $10 compare-at (retail is better)
        createCartLine({
          id: 'gid://shopify/ProductVariant/lipbalm',
          quantity: 1,
          currentPrice: '8.00',
          compareAtPrice: '10.00'
        }),
        // Product 3: Vitamin C - $39 retail, $42 compare-at (PFC is better)
        createCartLine({
          id: 'gid://shopify/ProductVariant/vitaminc',
          quantity: 1,
          currentPrice: '39.00',
          compareAtPrice: '42.00'
        })
      ];

      const result = run({
        discountNode: createDiscountNode(10),
        cart: createCart({ isCustomerMember: true, lines })
      });

      // Should apply discounts to moisturizer and vitamin C only
      expect(result.discounts).toHaveLength(2);
      
      // Moisturizer: $34 - ($34 * 0.9) = $34 - $30.60 = $3.40 discount
      const moisturizerDiscount = result.discounts.find(d => 
        d.targets[0].productVariant?.id === 'gid://shopify/ProductVariant/moisturizer'
      );
      expect(moisturizerDiscount?.value.fixedAmount?.amount).toBe('3.40');
      
      // Vitamin C: $39 - ($42 * 0.9) = $39 - $37.80 = $1.20 discount  
      const vitaminCDiscount = result.discounts.find(d => 
        d.targets[0].productVariant?.id === 'gid://shopify/ProductVariant/vitaminc'
      );
      expect(vitaminCDiscount?.value.fixedAmount?.amount).toBe('1.20');

      // Total expected discount: $3.40 + $1.20 = $4.60
      // BUT your bug shows only $3.40 total - suggesting only moisturizer discount applies!
    });

    it('should handle multiple quantities correctly - YOUR QUANTITY BUG', () => {
      // Test case: 2 moisturizers should give 2 × $3.40 = $6.80 discount
      const line = createCartLine({
        id: 'gid://shopify/ProductVariant/moisturizer',
        quantity: 2, // 2 moisturizers
        currentPrice: '34.00',
        compareAtPrice: '34.00'
      });

      const result = run({
        discountNode: createDiscountNode(10),
        cart: createCart({ isCustomerMember: true, lines: [line] })
      });

      expect(result.discounts).toHaveLength(1);
      expect(result.discounts[0].targets[0].productVariant?.quantity).toBe(2);
      
      // Each moisturizer: $34 - $30.60 = $3.40 discount per unit
      // For quantity 2: discount should apply to both units
      // Shopify handles per-unit discounts automatically with quantity
      expect(result.discounts[0].value.fixedAmount?.amount).toBe('3.40'); // Per unit amount
      
      // Note: If this is only applying once instead of twice, that's your quantity bug!
    });

    it('should calculate discount amount correctly', () => {
      // Test the core calculation: discount = currentPrice - targetPrice
      const line = createCartLine({
        id: 'gid://shopify/ProductVariant/123',
        quantity: 1,
        currentPrice: '25.00', // Current price = compare-at price
        compareAtPrice: '25.00'
      });

      const result = run({
        discountNode: createDiscountNode(10),
        cart: createCart({ isCustomerMember: true, lines: [line] })
      });

      // Target price = $25 * (1 - 0.10) = $22.50
      // Discount amount = $25 - $22.50 = $2.50
      expect(result.discounts[0].value.fixedAmount?.amount).toBe('2.50');
    });
  });

  describe('Edge cases', () => {
    it('should handle invalid configuration gracefully', () => {
      const line = createCartLine({
        id: 'gid://shopify/ProductVariant/123',
        quantity: 1,
        currentPrice: '20.00',
        compareAtPrice: '25.00'
      });

      const result = run({
        discountNode: {
          metafield: {
            value: '{"percentage": "invalid"}'
          }
        },
        cart: createCart({ isCustomerMember: true, lines: [line] })
      });

      expect(result.discounts).toHaveLength(0);
    });

    it('should handle percentage over 100', () => {
      const line = createCartLine({
        id: 'gid://shopify/ProductVariant/123',
        quantity: 1,
        currentPrice: '25.00',
        compareAtPrice: '25.00'
      });

      const result = run({
        discountNode: createDiscountNode(150),
        cart: createCart({ isCustomerMember: true, lines: [line] })
      });

      // Should cap at 100%
      expect(result.discounts).toHaveLength(1);
      expect(result.discounts[0].value.fixedAmount?.amount).toBe('25.00'); // 100% discount
    });

    it('should handle negative percentage', () => {
      const line = createCartLine({
        id: 'gid://shopify/ProductVariant/123',
        quantity: 1,
        currentPrice: '20.00',
        compareAtPrice: '25.00'
      });

      const result = run({
        discountNode: createDiscountNode(-10),
        cart: createCart({ isCustomerMember: true, lines: [line] })
      });

      // Should treat as 0% discount
      expect(result.discounts).toHaveLength(0);
    });
  });
});