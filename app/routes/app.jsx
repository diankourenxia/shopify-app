import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";
import { isRestrictedUser, getUserInfo } from "../utils/permissions.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  
  // 判断是否为受限用户（基于邮箱）
  const restricted = isRestrictedUser(session);
  const userInfo = getUserInfo(session);

  return { 
    apiKey: process.env.SHOPIFY_API_KEY || "",
    shop: session?.shop,
    isRestrictedUser: restricted,
    userInfo
  };
};

export default function App() {
  const { apiKey, shop, isRestrictedUser, userInfo } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/orders">订单管理</Link>
        {!isRestrictedUser && (
          <>
            <Link to="/app/fabrics">布料管理</Link>
            <Link to="/app/linings">衬布管理</Link>
            <Link to="/app/tags">标签管理</Link>
            <Link to="/app/orders/demo">订单管理(演示)</Link>
            <Link to="/app/additional">Additional page</Link>
          </>
        )}
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
