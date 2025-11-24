import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  await authenticate.admin(request);
  
  const prisma = (await import("../db.server")).default;
  const { getOrdersFromCache } = await import("../services/cache.server");
  
  try {
    // 从缓存获取订单数据
    const cacheData = await getOrdersFromCache();
    
    if (!cacheData || !cacheData.orders) {
      return json({ error: "无订单数据" }, { status: 400 });
    }
    
    const orders = cacheData.orders;
    const fabricsFound = new Set();
    const colorsFound = new Map(); // key: fullCode, value: { fabricCode, colorCode, colorName }
    
    // 提取所有布料信息
    for (const order of orders) {
      if (!order.lineItems?.edges) continue;
      
      for (const { node: item } of order.lineItems.edges) {
        const variantTitle = item.variant?.title;
        if (!variantTitle || variantTitle === 'Default Title') continue;
        
        // 解析布料编号，格式如 "8823-1" 或 "8823"
        const match = variantTitle.match(/^([A-Za-z0-9]+)(?:-(\d+))?/);
        if (!match) continue;
        
        const fabricCode = match[1];
        const colorCode = match[2] || null;
        
        fabricsFound.add(fabricCode);
        
        if (colorCode) {
          const fullCode = `${fabricCode}-${colorCode}`;
          if (!colorsFound.has(fullCode)) {
            colorsFound.set(fullCode, {
              fabricCode,
              colorCode,
              fullCode
            });
          }
        }
      }
    }
    
    // 创建或更新布料记录
    const createdFabrics = [];
    const createdColors = [];
    
    for (const fabricCode of fabricsFound) {
      // 检查布料是否已存在
      let fabric = await prisma.fabric.findUnique({
        where: { code: fabricCode }
      });
      
      if (!fabric) {
        // 创建新布料，默认价格为0
        fabric = await prisma.fabric.create({
          data: {
            code: fabricCode,
            prices: {
              create: {
                fabricPrice: 0,
                liningPrice: 0,
              }
            }
          }
        });
        createdFabrics.push(fabricCode);
      }
      
      // 为该布料创建颜色记录
      for (const [fullCode, colorInfo] of colorsFound) {
        if (colorInfo.fabricCode !== fabricCode) continue;
        
        // 检查颜色是否已存在
        const existingColor = await prisma.fabricColor.findUnique({
          where: { fullCode }
        });
        
        if (!existingColor) {
          await prisma.fabricColor.create({
            data: {
              fabricId: fabric.id,
              colorCode: colorInfo.colorCode,
              fullCode: colorInfo.fullCode,
            }
          });
          createdColors.push(fullCode);
        }
      }
    }
    
    return json({
      success: true,
      message: `扫描完成：发现 ${fabricsFound.size} 个布料材质，${colorsFound.size} 个颜色`,
      created: {
        fabrics: createdFabrics.length,
        colors: createdColors.length
      },
      details: {
        createdFabrics,
        createdColors
      }
    });
    
  } catch (error) {
    console.error('同步布料失败:', error);
    return json({ error: error.message }, { status: 500 });
  }
};
