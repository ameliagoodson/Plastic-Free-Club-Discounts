import type { ActionFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useActionData, useSubmit } from "@remix-run/react";
import {
  BlockStack,
  Button,
  Card,
  FormLayout,
  Page,
  TextField,
  Banner,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const title = formData.get("title") as string;
  const percentage = Number(formData.get("percentage") || 10);

  if (!title?.trim()) {
    return json({ errors: [{ message: "Title is required" }] });
  }

  const configuration = JSON.stringify({ percentage });

  try {
    const response = await admin.graphql(
      `#graphql
      mutation discountAutomaticAppCreate($automaticAppDiscount: DiscountAutomaticAppInput!) {
        discountAutomaticAppCreate(automaticAppDiscount: $automaticAppDiscount) {
          automaticAppDiscount {
            discountId
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        variables: {
          automaticAppDiscount: {
            title,
            functionId: "pfc-member-order-discount",
            startsAt: new Date().toISOString(),
            metafields: [
              {
                namespace: "$app:pfc-member-order-discount",
                key: "function-configuration",
                type: "json",
                value: configuration,
              },
            ],
          },
        },
      },
    );

    const responseJson = await response.json();

    if (responseJson.data?.discountAutomaticAppCreate?.userErrors?.length > 0) {
      return json({
        errors: responseJson.data.discountAutomaticAppCreate.userErrors,
      });
    }

    const discountId =
      responseJson.data?.discountAutomaticAppCreate?.automaticAppDiscount
        ?.discountId;

    if (discountId) {
      return redirect(`/app`);
    }

    return json({ success: true });
  } catch (error) {
    return json({ errors: [{ message: "Failed to create discount" }] });
  }
};

export default function CreateDiscount() {
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    submit(formData, { method: "post" });
  };

  return (
    <Page>
      <TitleBar title="Create PFC Member Discount" />
      <BlockStack gap="500">
        {actionData?.errors && (
          <Banner tone="critical">
            <p>Error creating discount:</p>
            <ul>
              {actionData.errors.map((error: any, index: number) => (
                <li key={index}>{error.message}</li>
              ))}
            </ul>
          </Banner>
        )}

        {actionData?.success && (
          <Banner tone="success">
            <p>Discount created successfully!</p>
          </Banner>
        )}

        <Card>
          <form onSubmit={handleSubmit}>
            <FormLayout>
              <TextField
                label="Discount Title"
                name="title"
                placeholder="PFC Member Discount"
                autoComplete="off"
                helpText="This will appear in your admin and on customer receipts"
              />

              <TextField
                label="Discount Percentage"
                name="percentage"
                type="number"
                placeholder="10"
                suffix="%"
                min="0"
                max="100"
                autoComplete="off"
                helpText="Percentage discount to apply (e.g., 10 for 10%)"
              />

              <Button submit primary>
                Create Discount
              </Button>
            </FormLayout>
          </form>
        </Card>

        <Card>
          <BlockStack gap="300">
            <p>
              <strong>This will create an automatic discount that:</strong>
            </p>
            <p>• Applies only to customers with the "PFC_member" tag</p>
            <p>
              • Uses compare-at-price when available, otherwise regular price
            </p>
            <p>• Applies discount per line item</p>
            <p>• Requires no discount code</p>
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
