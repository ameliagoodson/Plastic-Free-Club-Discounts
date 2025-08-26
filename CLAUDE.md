# Plastic Free Club Discounts App

## Quick Commands
- **Deploy functions**: `shopify app deploy --force`
- **Start dev**: `npm run dev` 
- **Run tests**: `npm run test:watch`
- **Debug discounts**: Click "🔍 Debug Discounts" button in app

## Testing Setup ✅
- Vitest configured with auto-watch mode
- Tests cover discount calculation logic and multi-product scenarios
- Run `npm run test:watch` during development for auto-testing

## Discount Logic
- Calculates from compare-at-price (not retail price)
- Implements "best price wins" automatically
- Expected discount for your 3-product test:
  - Moisturizer ($34): $3.40 discount
  - Lip balm ($8 vs $10): $0 discount (retail better)
  - Vitamin C ($39 vs $42): $1.20 discount
  - **TOTAL: $4.60** (but you're seeing $3.40 - need to investigate)

## Deployment Notes
- **Always deploy after function changes**: `shopify app deploy --force`
- Current version: plastic-free-club-discounts-36
- Functions deployed: pfc-member-order-discount, pfc-shipping-discount

## Bug Fixes Applied ✅
1. Fixed discount combining rules: `productDiscounts: true` 
2. Added auto-delete/recreate logic for discount updates
3. Deployed version 37 with combining fix

## Expected Results
- Moisturizer ($34): $3.40 discount
- Lip balm ($8 vs $10): $0 discount (retail better)  
- Vitamin C ($39 vs $42): $1.20 discount
- **TOTAL: $4.60** (was $3.40 due to combining rules)