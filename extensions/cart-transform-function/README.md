# PFC Cart Transform Function

This function applies PFC (Plastic-Free Club) member discounts to cart items at checkout time.

## Configuration

The function uses environment variables to configure the discount settings. You can set these in your Shopify app's environment:

### Environment Variables

- `PFC_DISCOUNT_ENABLED` - Set to "true" to enable discounts, "false" to disable (default: "true")
- `PFC_DISCOUNT_PERCENT` - Discount percentage (e.g., "10" for 10%) (default: "10")
- `PFC_MEMBER_TAG` - Tag used to identify PFC members (default: "plastic-free-club")

### Example Configuration

```bash
# Enable 15% discount for PFC members
PFC_DISCOUNT_ENABLED=true
PFC_DISCOUNT_PERCENT=15
PFC_MEMBER_TAG=plastic-free-club
```

## How It Works

1. **Customer Detection**: Checks if the customer has the configured PFC member tag
2. **Price Calculation**: 
   - Uses compare-at-price if available (preferred)
   - Falls back to original price if no compare-at-price
   - Applies the configured discount percentage
3. **Cart Update**: Updates the cart line prices and adds attributes for tracking

## Testing

To test the function:

1. Create a customer with the PFC member tag
2. Add products to cart
3. Check that discounted prices are applied at checkout

## Deployment

The function is automatically deployed when you run `shopify app deploy` from the root directory.
