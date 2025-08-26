import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");

  if (!customerId) {
    return json({
      message: "No customerId provided",
      usage: "Use: /api/test-customer?customerId=YOUR_CUSTOMER_ID",
      example: "Example: /api/test-customer?customerId=9304638554387",
      tip: "Your customer ID appears to be: 9304638554387",
      note: "Due to protected customer data requirements, you need to provide a specific customer ID to test",
    });
  }

  try {
    const { session, admin } = await authenticate.admin(request);

    // Get discount settings
    const settings = await db.discountSettings.findUnique({
      where: { shop: session.shop },
    });

    // Try to get customer data - this may fail if protected customer data access is not approved
    let customer = null;
    let customerError = null;

    try {
      const customerResponse = await admin.graphql(
        `
        query getCustomer($customerId: ID!) {
          customer(id: $customerId) {
            id
            firstName
            lastName
            email
            tags
          }
        }
      `,
        {
          variables: { customerId: `gid://shopify/Customer/${customerId}` },
        },
      );

      const customerData = (await customerResponse.json()) as any;

      // Check for GraphQL errors related to protected customer data
      if (customerData.errors) {
        const protectedDataError = customerData.errors.find(
          (error: any) =>
            error.message?.includes("not approved to access") ||
            error.message?.includes("protected customer data"),
        );

        if (protectedDataError) {
          customerError = "protected_customer_data_access_required";
        } else {
          customerError =
            customerData.errors[0]?.message || "Unknown GraphQL error";
        }
      } else {
        customer = customerData.data?.customer;
      }
    } catch (graphqlError) {
      console.error("GraphQL error:", graphqlError);
      customerError =
        graphqlError instanceof Error
          ? graphqlError.message
          : "GraphQL request failed";
    }

    // If we can't access customer data due to protected customer data requirements
    if (
      customerError === "protected_customer_data_access_required" ||
      customerError?.includes("not approved")
    ) {
      return json(
        {
          error: "Protected customer data access required",
          message: "This app needs approval to access customer data",
          customerId,
          solution: {
            step1: "Go to your Partner Dashboard",
            step2: "Navigate to Apps > Your App > API access",
            step3:
              "Find 'Protected customer data access' and click 'Request access'",
            step4: "Select 'Protected customer data' and provide your reasons",
            step5:
              "If you need name, email, address, or phone fields, select those too",
            step6: "Complete your Data protection details",
            step7: "Submit for review",
          },
          documentation:
            "https://shopify.dev/docs/apps/launch/protected-customer-data",
          fallback: {
            message:
              "For testing purposes, you can manually check if a customer has the PFC tag:",
            instructions: [
              "1. Go to Shopify Admin > Customers",
              "2. Find customer ID: " + customerId,
              "3. Check if they have the tag: '" +
                "PFC_member" +
                "'",
              "4. If they have the tag, they should get the discount",
            ],
            configuredTag: "PFC_member",
            discountSettings: {
              isEnabled: settings?.isEnabled || false,
              discountPercent: settings?.discountPercent || 0,
            },
          },
        },
        { status: 403 },
      );
    }

    // If customer not found
    if (!customer && !customerError) {
      return json(
        {
          error: "Customer not found",
          customerId,
          tip: "Make sure you're using the correct customer ID from Shopify admin",
        },
        { status: 404 },
      );
    }

    // If there was an error getting customer data
    if (
      customerError &&
      customerError !== "protected_customer_data_access_required"
    ) {
      return json(
        {
          error: "Failed to fetch customer data",
          details: customerError,
          customerId,
          tip: "Check the console for more details",
        },
        { status: 500 },
      );
    }

    // Success - we have customer data
    const customerTags = customer?.tags || [];
    const configuredTag = "PFC_member";
    const isPfcMember = customerTags.some(
      (tag: string) =>
        tag.trim().toLowerCase() === configuredTag.trim().toLowerCase(),
    );

    return json({
      customer: {
        id: customer?.id,
        firstName: customer?.firstName,
        lastName: customer?.lastName,
        email: customer?.email,
        tags: customerTags,
      },
      isPfcMember,
      pfcTagFound: customerTags.some(
        (tag: string) =>
          tag.trim().toLowerCase() === configuredTag.trim().toLowerCase(),
      ),
      configuredTag,
      allTags: customerTags,
      discountSettings: {
        isEnabled: settings?.isEnabled || false,
        discountPercent: settings?.discountPercent || 0,
      },
      debug: {
        customerId,
        shop: session.shop,
        tagComparison: {
          configuredTag,
          customerTags,
          isMatch: isPfcMember,
        },
      },
    });
  } catch (error) {
    console.error("Error in test customer API:", error);
    return json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
        customerId,
        tip: "Check the console for more details",
      },
      { status: 500 },
    );
  }
};
