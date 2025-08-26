// Simple test to debug your exact discount scenario
const { run } = require('./extensions/pfc-member-order-discount/src/run.ts');

// Simulate your exact cart
const testInput = {
  discountNode: {
    metafield: {
      value: '{"percentage":10}' // 10% discount like your debug output
    }
  },
  cart: {
    buyerIdentity: {
      customer: {
        hasAnyTag: true // PFC member
      }
    },
    lines: [
      // Moisturizer: $34 retail = $34 compare-at (should get $3.40 discount)
      {
        cost: {
          amountPerQuantity: { amount: "34.00" },
          compareAtAmountPerQuantity: { amount: "34.00" }
        },
        merchandise: { id: "gid://shopify/ProductVariant/moisturizer" }
      },
      // Lip balm: $8 retail, $10 compare-at (should get $0 discount - retail better)
      {
        cost: {
          amountPerQuantity: { amount: "8.00" },
          compareAtAmountPerQuantity: { amount: "10.00" }
        },
        merchandise: { id: "gid://shopify/ProductVariant/lipbalm" }
      },
      // Vitamin C: $39 retail, $42 compare-at (should get $1.20 discount)
      {
        cost: {
          amountPerQuantity: { amount: "39.00" },
          compareAtAmountPerQuantity: { amount: "42.00" }
        },
        merchandise: { id: "gid://shopify/ProductVariant/vitaminc" }
      }
    ]
  }
};

console.log("=== TESTING YOUR EXACT CART SCENARIO ===");
console.log("Expected:");
console.log("- Moisturizer: $3.40 discount");
console.log("- Lip balm: $0 discount (retail better)");
console.log("- Vitamin C: $1.20 discount");
console.log("- TOTAL: $4.60 discount");
console.log("");

const result = run(testInput);

console.log("ACTUAL RESULT:");
console.log("Number of discounts:", result.discounts.length);

let totalDiscount = 0;
result.discounts.forEach((discount, index) => {
  const amount = parseFloat(discount.value.fixedAmount.amount);
  totalDiscount += amount;
  console.log(`Discount ${index + 1}: $${amount} - ${discount.message}`);
  console.log(`  Target: ${discount.targets[0].productVariant?.id}`);
});

console.log("");
console.log(`TOTAL CALCULATED DISCOUNT: $${totalDiscount.toFixed(2)}`);
console.log(`YOUR CART SHOWS: $3.40`);
console.log(`DISCREPANCY: $${Math.abs(totalDiscount - 3.40).toFixed(2)}`);

if (totalDiscount === 4.60) {
  console.log("✅ FUNCTION IS WORKING CORRECTLY!");
  console.log("🐛 The issue is in your Shopify configuration/deployment");
} else {
  console.log("❌ FUNCTION HAS A BUG!");
}