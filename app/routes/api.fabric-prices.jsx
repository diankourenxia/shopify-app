import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  
  const prisma = (await import("../db.server")).default;
  
  // 获取所有布料及其最新价格
  const fabrics = await prisma.fabric.findMany({
    include: {
      colors: {
        include: {
          prices: {
            orderBy: { effectiveDate: 'desc' },
            take: 1
          }
        }
      },
      prices: {
        orderBy: { effectiveDate: 'desc' },
        take: 1
      }
    },
    orderBy: { code: 'asc' }
  });

  return json({ fabrics });
};
