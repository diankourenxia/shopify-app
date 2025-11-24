import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  
  const prisma = (await import("../db.server")).default;
  
  // 获取所有衬布类型及其当前价格
  const linings = await prisma.lining.findMany({
    select: {
      id: true,
      type: true,
      price: true,
    },
    orderBy: { type: 'asc' }
  });

  return json({ linings });
};
