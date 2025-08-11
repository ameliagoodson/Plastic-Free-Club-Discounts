import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, BlockStack, Text, Banner } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  // Ensure the user is authenticated in Admin; no data needed
  await authenticate.admin(request);
  return json({});
}

export default function CartTransformCreate() {
  useLoaderData<typeof loader>();
  return (
    <Page>
      <TitleBar title="Cart transform" />
      <BlockStack gap="400">
        <Banner tone="success">
          <p>
            No settings required. Click Save/Install in the top bar to enable
            the Cart Transform for this store.
          </p>
        </Banner>
        <Text as="p" variant="bodyMd">
          This function applies member pricing at checkout. Ensure you test
          while logged in as a customer.
        </Text>
      </BlockStack>
    </Page>
  );
}
