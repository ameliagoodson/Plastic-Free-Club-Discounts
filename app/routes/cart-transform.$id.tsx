import type { LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData, useParams } from "@remix-run/react";
import { Page, BlockStack, Text, Banner } from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

export async function loader({ request, params }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  return json({ id: params.id });
}

export default function CartTransformDetails() {
  const { id } = useLoaderData<typeof loader>();
  const params = useParams();
  return (
    <Page>
      <TitleBar title={`Cart transform #${id || params.id}`} />
      <BlockStack gap="400">
        <Banner tone="info">
          <p>
            This extension has no additional settings. It will run automatically
            at checkout.
          </p>
        </Banner>
        <Text as="p" variant="bodyMd">
          If discounts are not appearing, ensure you are logged in at checkout.
        </Text>
      </BlockStack>
    </Page>
  );
}
