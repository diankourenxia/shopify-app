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
        const itemTitle = item.title;
        if (!itemTitle) continue;
        
        // 从商品标题中提取布料信息
        // 格式如: "Celina# 8823-02 Light Beige" 或 "Amara# 1038-01 Light Beige"
        // 匹配 "数字-数字" 格式
        const match = itemTitle.match(/(\d+)-(\d+)/);
        if (!match) continue;
        
        const fabricCode = match[1];
        // 将颜色编号转为整数再转字符串，去掉前导零（05 -> 5）
        const colorCode = parseInt(match[2], 10).toString();
        
        // 尝试提取颜色名称（# 后面的部分，去掉布料编号）
        const colorNameMatch = itemTitle.match(/# \d+-\d+\s+(.+)$/);
        const colorName = colorNameMatch ? colorNameMatch[1].trim() : null;
        
        fabricsFound.add(fabricCode);
        
        // 颜色编号必须存在才记录
        const fullCode = `${fabricCode}-${colorCode}`;
        if (!colorsFound.has(fullCode)) {
          colorsFound.set(fullCode, {
            fabricCode,
            colorCode,
            colorName,
            fullCode
          });
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
        
        // 检查颜色是否已存在（检查标准化格式）
        let existingColor = await prisma.fabricColor.findUnique({
          where: { fullCode }
        });
        
        // 如果标准化格式不存在，尝试查找带前导零的格式（如 8823-05）
        if (!existingColor && colorInfo.colorCode.length < 2) {
          const paddedCode = colorInfo.colorCode.padStart(2, '0');
          const paddedFullCode = `${fabricCode}-${paddedCode}`;
          existingColor = await prisma.fabricColor.findUnique({
            where: { fullCode: paddedFullCode }
          });
        }
        
        if (!existingColor) {
          await prisma.fabricColor.create({
            data: {
              fabricId: fabric.id,
              colorCode: colorInfo.colorCode,
              colorName: colorInfo.colorName,
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
