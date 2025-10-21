import { json } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  try {
    await authenticate.admin(request);
    
    const formData = await request.formData();
    const orderId = formData.get("orderId");
    const status = formData.get("status");

    if (!orderId || !status) {
      return json({ error: "缺少必要参数" }, { status: 400 });
    }

    // 更新或创建订单状态
    const orderStatus = await prisma.orderStatus.upsert({
      where: { orderId },
      update: { status },
      create: { orderId, status },
    });

    return json({ success: true, orderStatus });
  } catch (error) {
    console.error("更新订单状态失败:", error);
    return json({ error: "更新失败" }, { status: 500 });
  }
};

export const loader = async ({ request }) => {
  try {
    await authenticate.admin(request);
    
    const url = new URL(request.url);
    const orderId = url.searchParams.get("orderId");

    if (orderId) {
      // 获取单个订单状态
      const orderStatus = await prisma.orderStatus.findUnique({
        where: { orderId },
      });
      return json({ orderStatus });
    }

    // 获取所有订单状态
    const orderStatuses = await prisma.orderStatus.findMany();
    const statusMap = {};
    orderStatuses.forEach(status => {
      statusMap[status.orderId] = status.status;
    });
    
    return json({ statusMap });
  } catch (error) {
    console.error("获取订单状态失败:", error);
    return json({ error: "获取失败" }, { status: 500 });
  }
};

