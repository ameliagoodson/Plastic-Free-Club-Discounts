import { describe, it, expect, vi, beforeEach } from 'vitest'
import { calculateMemberPrice, calculateDynamicPrice } from './discount-logic.server'

describe('calculateMemberPrice', () => {
  it('should calculate correct member price from compare-at-price', () => {
    const result = calculateMemberPrice('10.00', 10)
    expect(result).toBe('9.00')
  })

  it('should handle 0% discount', () => {
    const result = calculateMemberPrice('10.00', 0)
    expect(result).toBe('10.00')
  })

  it('should handle 100% discount', () => {
    const result = calculateMemberPrice('10.00', 100)
    expect(result).toBe('0.00')
  })

  it('should return null for null compare-at-price', () => {
    const result = calculateMemberPrice(null, 10)
    expect(result).toBe(null)
  })

  it('should return null for undefined compare-at-price', () => {
    const result = calculateMemberPrice(undefined, 10)
    expect(result).toBe(null)
  })

  it('should return null for zero compare-at-price', () => {
    const result = calculateMemberPrice('0', 10)
    expect(result).toBe(null)
  })

  it('should return null for negative compare-at-price', () => {
    const result = calculateMemberPrice('-5.00', 10)
    expect(result).toBe(null)
  })

  // Test your specific scenarios
  describe('Real-world scenarios', () => {
    it('should handle scenario 1: compare-at equals retail (10% discount should apply)', () => {
      // If compare-at-price = retail price, 10% discount should apply
      const result = calculateMemberPrice('20.00', 10)
      expect(result).toBe('18.00') // 10% off $20
    })

    it('should handle scenario 2: retail $8, compare-at $10', () => {
      // Customer should get the better price (retail $8 vs PFC $9)
      const pfcPrice = calculateMemberPrice('10.00', 10)
      expect(pfcPrice).toBe('9.00')
      // Note: The function doesn't handle "best price wins" logic - that's handled elsewhere
    })

    it('should handle scenario 3: retail $39, compare-at $42', () => {
      // PFC 10% off $42 = $37.80 (better than retail $39)
      const result = calculateMemberPrice('42.00', 10)
      expect(result).toBe('37.80')
    })

    it('should handle various discount percentages correctly', () => {
      const compareAt = '100.00'
      
      expect(calculateMemberPrice(compareAt, 5)).toBe('95.00')
      expect(calculateMemberPrice(compareAt, 15)).toBe('85.00')
      expect(calculateMemberPrice(compareAt, 25)).toBe('75.00')
      expect(calculateMemberPrice(compareAt, 50)).toBe('50.00')
    })
  })

  describe('Edge cases and precision', () => {
    it('should handle decimal precision correctly', () => {
      const result = calculateMemberPrice('10.99', 10)
      expect(result).toBe('9.89') // Should be exactly 2 decimal places
    })

    it('should handle small amounts', () => {
      const result = calculateMemberPrice('0.01', 10)
      expect(result).toBe('0.01') // 10% of $0.01 rounds to $0.01
    })

    it('should handle large amounts', () => {
      const result = calculateMemberPrice('999.99', 10)
      expect(result).toBe('899.99')
    })
  })
})

describe('calculateDynamicPrice', () => {
  let mockAdmin: any
  let mockDb: any

  beforeEach(() => {
    mockAdmin = {
      graphql: vi.fn()
    }

    // Mock the database module
    vi.doMock('../db.server', () => ({
      default: {
        discountSettings: {
          findUnique: vi.fn()
        }
      }
    }))
  })

  describe('Settings validation', () => {
    it('should return disabled state when settings not found', async () => {
      // Mock db.discountSettings.findUnique to return null
      const mockDb = await import('../db.server')
      vi.mocked(mockDb.default.discountSettings.findUnique).mockResolvedValue(null)

      const result = await calculateDynamicPrice(
        'test-shop',
        'customer-123',
        'product-456',
        'variant-789',
        mockAdmin
      )

      expect(result).toEqual({
        isPfcMember: false,
        discountPercent: 0,
        isEnabled: false,
        originalPrice: '0.00'
      })
    })

    it('should return disabled state when isEnabled is false', async () => {
      const mockDb = await import('../db.server')
      vi.mocked(mockDb.default.discountSettings.findUnique).mockResolvedValue({
        shop: 'test-shop',
        discountPercent: 10,
        isEnabled: false,
      })

      const result = await calculateDynamicPrice(
        'test-shop',
        'customer-123',
        'product-456',
        'variant-789',
        mockAdmin
      )

      expect(result).toEqual({
        isPfcMember: false,
        discountPercent: 0,
        isEnabled: false,
        originalPrice: '0.00'
      })
    })
  })

  describe('Customer tag checking', () => {
    it('should correctly identify PFC member with exact tag match', async () => {
      const mockDb = await import('../db.server')
      vi.mocked(mockDb.default.discountSettings.findUnique).mockResolvedValue({
        shop: 'test-shop',
        discountPercent: 10,
        isEnabled: true,
      })

      mockAdmin.graphql
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            data: {
              customer: {
                id: 'gid://shopify/Customer/123',
                tags: ['PFC_member', 'loyal_customer']
              }
            }
          })
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            data: {
              product: {
                variants: {
                  edges: [{
                    node: {
                      id: 'gid://shopify/ProductVariant/789',
                      price: '20.00',
                      compareAtPrice: '25.00'
                    }
                  }]
                }
              }
            }
          })
        })

      const result = await calculateDynamicPrice(
        'test-shop',
        '123',
        '456',
        '789',
        mockAdmin
      )

      expect(result.isPfcMember).toBe(true)
      expect(result.memberPrice).toBe('22.50') // 10% off $25.00 = $22.50
    })

    it('should handle case-insensitive tag matching', async () => {
      const mockDb = await import('../db.server')
      vi.mocked(mockDb.default.discountSettings.findUnique).mockResolvedValue({
        shop: 'test-shop',
        discountPercent: 10,
        isEnabled: true,
      })

      mockAdmin.graphql
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            data: {
              customer: {
                id: 'gid://shopify/Customer/123',
                tags: ['pfc_member'] // lowercase version
              }
            }
          })
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({
            data: {
              product: {
                variants: {
                  edges: [{
                    node: {
                      id: 'gid://shopify/ProductVariant/789',
                      price: '20.00',
                      compareAtPrice: '25.00'
                    }
                  }]
                }
              }
            }
          })
        })

      const result = await calculateDynamicPrice(
        'test-shop',
        '123',
        '456',
        '789',
        mockAdmin
      )

      expect(result.isPfcMember).toBe(true)
    })
  })

  describe('Your specific multi-product scenarios', () => {
    beforeEach(async () => {
      const mockDb = await import('../db.server')
      vi.mocked(mockDb.default.discountSettings.findUnique).mockResolvedValue({
        shop: 'test-shop',
        discountPercent: 10,
        isEnabled: true,
      })

      // Mock customer as PFC member
      mockAdmin.graphql.mockImplementation((query: string) => {
        if (query.includes('getCustomer')) {
          return {
            json: () => Promise.resolve({
              data: {
                customer: {
                  id: 'gid://shopify/Customer/123',
                  tags: ['PFC_member']
                }
              }
            })
          }
        }
        
        // Mock product responses based on your scenarios
        return {
          json: () => Promise.resolve({
            data: {
              product: {
                variants: {
                  edges: [] // Will be overridden in individual tests
                }
              }
            }
          })
        }
      })
    })

    it('should handle scenario 1: compare-at equals retail', async () => {
      // Override the product mock for this specific test
      mockAdmin.graphql.mockImplementation((query: string) => {
        if (query.includes('getCustomer')) {
          return {
            json: () => Promise.resolve({
              data: {
                customer: {
                  id: 'gid://shopify/Customer/123',
                  tags: ['PFC_member']
                }
              }
            })
          }
        }
        
        return {
          json: () => Promise.resolve({
            data: {
              product: {
                variants: {
                  edges: [{
                    node: {
                      id: 'gid://shopify/ProductVariant/1',
                      price: '20.00', // Same as compare-at
                      compareAtPrice: '20.00'
                    }
                  }]
                }
              }
            }
          })
        }
      })

      const result = await calculateDynamicPrice('test-shop', '123', '1', '1', mockAdmin)
      
      expect(result.isPfcMember).toBe(true)
      expect(result.memberPrice).toBe('18.00') // 10% off $20
      expect(result.originalPrice).toBe('20.00')
      expect(result.compareAtPrice).toBe('20.00')
    })

    it('should handle scenario 2: retail $8, compare-at $10', async () => {
      mockAdmin.graphql.mockImplementation((query: string) => {
        if (query.includes('getCustomer')) {
          return {
            json: () => Promise.resolve({
              data: {
                customer: {
                  id: 'gid://shopify/Customer/123',
                  tags: ['PFC_member']
                }
              }
            })
          }
        }
        
        return {
          json: () => Promise.resolve({
            data: {
              product: {
                variants: {
                  edges: [{
                    node: {
                      id: 'gid://shopify/ProductVariant/2',
                      price: '8.00',
                      compareAtPrice: '10.00'
                    }
                  }]
                }
              }
            }
          })
        }
      })

      const result = await calculateDynamicPrice('test-shop', '123', '2', '2', mockAdmin)
      
      expect(result.isPfcMember).toBe(true)
      expect(result.memberPrice).toBe('9.00') // 10% off $10 = $9
      expect(result.originalPrice).toBe('8.00')
      expect(result.compareAtPrice).toBe('10.00')
      // Note: In this case, retail ($8) is better than PFC price ($9)
      // The Shopify function should handle "best price wins"
    })

    it('should handle scenario 3: retail $39, compare-at $42', async () => {
      mockAdmin.graphql.mockImplementation((query: string) => {
        if (query.includes('getCustomer')) {
          return {
            json: () => Promise.resolve({
              data: {
                customer: {
                  id: 'gid://shopify/Customer/123',
                  tags: ['PFC_member']
                }
              }
            })
          }
        }
        
        return {
          json: () => Promise.resolve({
            data: {
              product: {
                variants: {
                  edges: [{
                    node: {
                      id: 'gid://shopify/ProductVariant/3',
                      price: '39.00',
                      compareAtPrice: '42.00'
                    }
                  }]
                }
              }
            }
          })
        }
      })

      const result = await calculateDynamicPrice('test-shop', '123', '3', '3', mockAdmin)
      
      expect(result.isPfcMember).toBe(true)
      expect(result.memberPrice).toBe('37.80') // 10% off $42 = $37.80
      expect(result.originalPrice).toBe('39.00')
      expect(result.compareAtPrice).toBe('42.00')
      // PFC price ($37.80) is better than retail ($39)
    })
  })
})