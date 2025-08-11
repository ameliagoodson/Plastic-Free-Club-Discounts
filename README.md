# Plastic Free Club Discounts

A Shopify app that provides dynamic pricing for Plastic-Free Club (PFC) members.

## Features

- **Dynamic Pricing**: Automatically applies discounts to PFC members at checkout
- **Customer Detection**: Identifies PFC members using customer tags
- **Flexible Configuration**: Configurable discount percentage and member tag
- **Cart Transform Function**: Applies discounts at checkout time
- **Theme App Extension**: Shows discounted prices on product pages
- **Real-time Calculation**: Prices calculated from compare-at-price or regular price

## How It Works

1. **Customer Detection**: The app checks if customers have the configured PFC member tag
2. **Price Calculation**: Discounts are calculated from compare-at-price (preferred) or regular price
3. **Cart Transformation**: Cart transform function applies discounts at checkout
4. **Product Display**: Theme app extension shows discounted prices on product pages

## Setup Instructions

### 1. Configure Discount Settings

1. Go to your Shopify admin → Apps → Plastic Free Club Discounts
2. Set your discount percentage (e.g., 10 for 10%)
3. Configure the PFC member tag (default: "plastic-free-club")
4. Enable dynamic pricing

### 2. Enable Cart Transform Function

1. Go to Shopify admin → Settings → Apps and sales channels
2. Find "Plastic Free Club Discounts" and click "Configure"
3. Look for "Cart Transform Function" and enable it

### 3. Add Theme App Extension

1. Go to Shopify admin → Online Store → Themes
2. Click "Customize" on your active theme
3. Add the "PFC Product Pricing" block to product pages
4. This will show discounted prices to PFC members

### 4. Test with PFC Member

1. Create or find a customer with the PFC member tag
2. Add products to cart as that customer
3. Proceed to checkout - you should see discounted prices

## Configuration

### Environment Variables

The cart transform function uses these environment variables:

- `PFC_DISCOUNT_ENABLED` - Set to "true" to enable discounts (default: "true")
- `PFC_DISCOUNT_PERCENT` - Discount percentage (e.g., "10" for 10%) (default: "10")
- `PFC_MEMBER_TAG` - Tag used to identify PFC members (default: "plastic-free-club")

### Example Configuration

```bash
PFC_DISCOUNT_ENABLED=true
PFC_DISCOUNT_PERCENT=15
PFC_MEMBER_TAG=plastic-free-club
```

## Development

### Prerequisites

- Node.js 18+ 
- Shopify CLI
- A Shopify Partner account

### Local Development

1. Clone the repository
2. Install dependencies: `npm install`
3. Start development server: `npm run dev`
4. Follow the Shopify CLI prompts to set up your app

### Building and Deploying

1. Build the app: `npm run build`
2. Deploy to Shopify: `npx shopify app deploy`

## Architecture

- **Backend**: Remix app with Prisma database
- **Cart Transform**: Shopify Function for checkout pricing
- **Theme Extension**: Liquid templates for product page display
- **Database**: SQLite (development) / PostgreSQL (production)

## Support

For issues or questions, please check the debug information in the app admin interface or contact support.
