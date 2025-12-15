import { json } from "@remix-run/node";

/**
 * 水洗标 PDF 生成 API
 * 根据订单信息生成水洗标 PDF
 * 注意：此 API 不需要 Shopify 认证，直接接收数据生成 HTML
 */

/**
 * 解析窗帘尺寸信息
 */
function parseCurtainDimensions(properties) {
  let width = "";
  let height = "";
  
  for (const prop of properties || []) {
    const name = prop.name?.toLowerCase() || "";
    const value = prop.value || "";
    
    if (name.includes("width") || name.includes("宽")) {
      // 提取数字部分（英寸），转换为厘米
      const match = value.match(/[\d.]+/);
      if (match) {
        const inches = parseFloat(match[0]);
        width = Math.round(inches * 2.54).toString(); // 转换为厘米
      }
    }
    if (name.includes("height") || name.includes("高") || name.includes("length") || name.includes("drop")) {
      const match = value.match(/[\d.]+/);
      if (match) {
        const inches = parseFloat(match[0]);
        height = Math.round(inches * 2.54).toString(); // 转换为厘米
      }
    }
  }
  
  return { width, height };
}

/**
 * 解析窗帘选项（单开/双开/定型等）
 */
function parseCurtainOptions(title, properties) {
  const options = {
    singleOpen: false,  // 单开
    doubleOpen: false,  // 双开
    heatSetting: false, // 定型
    leadBlock: false,   // 铅块
    binding: false,     // 绑带
  };
  
  const titleLower = (title || "").toLowerCase();
  const propsText = (properties || []).map(p => `${p.name} ${p.value}`).join(" ").toLowerCase();
  const combined = `${titleLower} ${propsText}`;
  
  // 单开/双开判断
  if (combined.includes("pair") || combined.includes("双开") || combined.includes("double")) {
    options.doubleOpen = true;
  } else {
    options.singleOpen = true;
  }
  
  // 定型 - Body Memory Shaped
  if (combined.includes("定型") || combined.includes("memory") || combined.includes("shaped")) {
    options.heatSetting = true;
  }
  
  // 铅块
  if (combined.includes("铅块") || combined.includes("lead") || combined.includes("weight")) {
    options.leadBlock = true;
  }
  
  // 绑带 - Tieback
  if (combined.includes("绑带") || combined.includes("tieback") || combined.includes("tie back")) {
    // 检查是否选择了绑带（排除 No Need）
    const tiebackProp = (properties || []).find(p => 
      p.name?.toLowerCase().includes("tieback")
    );
    if (tiebackProp && !tiebackProp.value?.toLowerCase().includes("no")) {
      options.binding = true;
    } else if (!tiebackProp && combined.includes("tieback")) {
      options.binding = true;
    }
  }
  
  return options;
}

/**
 * 解析布料型号
 */
function parseFabricModel(title, properties, variantTitle) {
  // 优先从 variant title 获取
  if (variantTitle && variantTitle !== "Default Title") {
    return variantTitle;
  }
  
  // 从属性中查找布料信息
  for (const prop of properties || []) {
    const name = prop.name?.toLowerCase() || "";
    if (name.includes("fabric") || name.includes("布料") || name.includes("color") || name.includes("颜色") || name.includes("material")) {
      return prop.value || "";
    }
  }
  return "";
}

/**
 * 解析款式（头部类型）
 */
function parseStyle(title, properties) {
  // 头部名称映射表
  const headerMapping = {
    'Pinch Pleat - Double': '韩褶-L型-2折',
    'Pinch Pleat - Triple': '韩褶-L型-3折',
    'Euro Pleat - Double': '韩褶-7型-2折',
    'Euro Pleat - Triple': '韩褶-7型-3折',
    'Rod Pocket': '穿杆带遮轨',
    'Grommet Top': '打孔',
    'Ripple Fold': '蛇形帘（铆钉）',
    'Flat Panel': '吊环挂钩（四合一）',
    'Back Tab': '背带式'
  };
  
  // 从属性中查找款式信息
  for (const prop of properties || []) {
    const name = prop.name?.toLowerCase() || "";
    if (name.includes("header") || name.includes("style") || name.includes("款式") || name.includes("type")) {
      const headerValue = prop.value?.split('(')[0].trim() || "";
      return headerMapping[headerValue] || headerValue || prop.value;
    }
  }
  
  // 从标题中提取
  const titleLower = (title || "").toLowerCase();
  if (titleLower.includes("grommet")) return "打孔";
  if (titleLower.includes("rod pocket")) return "穿杆带遮轨";
  if (titleLower.includes("pinch pleat")) return "韩褶";
  if (titleLower.includes("ripple")) return "蛇形帘";
  if (titleLower.includes("back tab")) return "背带式";
  
  return "";
}

/**
 * 解析衬布（里料）
 */
function parseLining(title, properties) {
  // 里料类型映射表
  const liningTypeMapping = {
    'White_Shading Rate 100%': '漂白春亚纺1#',
    'White_Shading Rate 30%': '18-1',
    'Beige_Shading Rate 50%': 'A60-2',
    'Black_Shading Rate 80%': 'A60-28',
    'Black_Shading Rate 100%': '2019-18',
    'No Lining': '无',
    'None': '无'
  };
  
  for (const prop of properties || []) {
    const name = prop.name?.toLowerCase() || "";
    if (name.includes("lining") || name.includes("衬布") || name.includes("backing") || name.includes("里料")) {
      const liningValue = prop.value?.split('(')[0].trim() || "";
      return liningTypeMapping[liningValue] || liningValue || prop.value;
    }
  }
  return "";
}

/**
 * 生成水洗标 HTML 内容
 */
function generateWashLabelHTML(labelData) {
  const { orderNo, fabricModel, width, height, style, lining, options, note } = labelData;
  
  // 格式化打印时间
  const printTime = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const checkbox = (checked) => checked 
    ? `<span style="display:inline-block;width:16px;height:16px;border:2px solid #1a365d;background:#1a365d;margin:0 8px;vertical-align:middle;"></span>`
    : `<span style="display:inline-block;width:16px;height:16px;border:2px solid #1a365d;background:white;margin:0 8px;vertical-align:middle;"></span>`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    @page {
      size: 80mm 120mm;
      margin: 5mm;
    }
    body {
      font-family: "Microsoft YaHei", "SimHei", Arial, sans-serif;
      font-size: 14px;
      line-height: 2;
      padding: 10px;
      margin: 0;
    }
    .label-container {
      width: 70mm;
      padding: 5mm;
    }
    .row {
      margin-bottom: 8px;
    }
    .label {
      font-weight: bold;
    }
    .value {
      margin-left: 5px;
    }
    .size-row {
      display: flex;
      gap: 20px;
    }
    .options-row {
      display: flex;
      flex-wrap: wrap;
      gap: 15px;
      margin-top: 10px;
    }
    .option {
      display: flex;
      align-items: center;
    }
  </style>
</head>
<body>
  <div class="label-container">
    <div class="row">
      <span class="label">订单编号:</span>
      <span class="value">${orderNo || ""}</span>
    </div>
    
    <div class="row">
      <span class="label">布料型号:</span>
      <span class="value">${fabricModel || ""}</span>
    </div>
    
    <div class="row size-row">
      <span><span class="label">尺寸: 宽:</span> <span class="value">${width || ""}</span></span>
      <span><span class="label">高:</span> <span class="value">${height || ""}</span></span>
    </div>
    
    <div class="row">
      <span class="label">款式:</span>
      <span class="value">${style || ""}</span>
    </div>
    
    <div class="row">
      <span class="label">衬布:</span>
      <span class="value">${lining || ""}</span>
    </div>
    
    <div class="options-row">
      <span class="option">单开 ${checkbox(options.singleOpen)}</span>
      <span class="option">双开 ${checkbox(options.doubleOpen)}</span>
      <span class="option">定型 ${checkbox(options.heatSetting)}</span>
    </div>
    
    <div class="options-row">
      <span class="option">铅块 ${checkbox(options.leadBlock)}</span>
      <span class="option">绑带 ${checkbox(options.binding)}</span>
    </div>
    
    ${note ? `<div class="row" style="margin-top: 10px;"><span class="label">备注:</span> <span class="value">${note}</span></div>` : ""}
    
    <div class="row print-time" style="margin-top: 15px; font-size: 12px; color: #666;">
      打印时间: ${printTime}
    </div>
  </div>
</body>
</html>
`;
}

/**
 * 生成多个水洗标的 HTML（用于批量打印）
 */
function generateMultiLabelHTML(labels) {
  // 格式化打印时间
  const printTime = new Date().toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  const labelsHTML = labels.map((labelData, idx) => {
    const { orderNo, fabricModel, width, height, style, lining, options, quantity, note } = labelData;
    const checkbox = (checked) => checked 
      ? `<span style="display:inline-block;width:14px;height:14px;border:2px solid #1a365d;background:#1a365d;margin:0 6px;vertical-align:middle;"></span>`
      : `<span style="display:inline-block;width:14px;height:14px;border:2px solid #1a365d;background:white;margin:0 6px;vertical-align:middle;"></span>`;
    // 只有不是最后一个才加分页
    const pageBreak = idx < labels.length - 1 ? 'page-break-after: always;' : '';
    return `
    <div class="label-card label-page" style="${pageBreak}">
      <div class="row">
        <span class="label">订单编号:</span>
        <span class="value">${orderNo || ""}</span>
      </div>
      <div class="row">
        <span class="label">布料型号:</span>
        <span class="value">${fabricModel || ""}</span>
      </div>
      <div class="row size-row">
        <span><span class="label">尺寸: 宽:</span> <span class="value">${width || ""}</span></span>
        <span><span class="label">高:</span> <span class="value">${height || ""}</span></span>
      </div>
      <div class="row">
        <span class="label">款式:</span>
        <span class="value">${style || ""}</span>
      </div>
      <div class="row">
        <span class="label">衬布:</span>
        <span class="value">${lining || ""}</span>
      </div>
      <div class="options-row">
        <span class="option">单开 ${checkbox(options.singleOpen)}</span>
        <span class="option">双开 ${checkbox(options.doubleOpen)}</span>
        <span class="option">定型 ${checkbox(options.heatSetting)}</span>
      </div>
      <div class="options-row">
        <span class="option">铅块 ${checkbox(options.leadBlock)}</span>
        <span class="option">绑带 ${checkbox(options.binding)}</span>
      </div>
      ${quantity > 1 ? `<div class="quantity">数量: ${quantity}</div>` : ""}
      ${note ? `<div class="row note"><span class="label">备注:</span> <span class="value">${note}</span></div>` : ""}
      <div class="print-time">打印时间: ${printTime}</div>
    </div>
    `;
  }).join('\n');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>水洗标打印</title>
  <style>
    @page {
      size: A4;
      margin: 10mm;
    }
    @media print {
      .label-page {
        page-break-after: always;
        page-break-inside: avoid;
      }
      .print-btn {
        display: none;
      }
    }
    body {
      font-family: "Microsoft YaHei", "SimHei", Arial, sans-serif;
      font-size: 12px;
      line-height: 1.8;
      padding: 10px;
      margin: 0;
    }
    .label-card {
      width: 75mm;
      border: 1px solid #ccc;
      padding: 10px;
      box-sizing: border-box;
      margin: 0 auto 0 auto;
    }
    .row {
      margin-bottom: 5px;
    }
    .label {
      font-weight: bold;
    }
    .value {
      margin-left: 5px;
    }
    .size-row {
      display: flex;
      gap: 15px;
    }
    .options-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-top: 8px;
    }
    .option {
      display: flex;
      align-items: center;
      font-size: 11px;
    }
    .quantity {
      margin-top: 8px;
      font-weight: bold;
      color: #666;
    }
    .note {
      margin-top: 8px;
    }
    .print-time {
      margin-top: 10px;
      font-size: 10px;
      color: #999;
    }
    .print-btn {
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 10px 20px;
      background: #1a365d;
      color: white;
      border: none;
      border-radius: 5px;
      cursor: pointer;
      font-size: 14px;
    }
    .print-btn:hover {
      background: #2c5282;
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">打印水洗标</button>
  ${labelsHTML}
</body>
</html>
`;
}

export const action = async ({ request }) => {
  const formData = await request.formData();
  const action = formData.get("action");

  try {
    if (action === "generateLabel") {
      // 生成单个水洗标 - 直接从前端接收数据
      const orderNo = formData.get("orderNo") || "";
      const itemTitle = formData.get("itemTitle") || "";
      const variantTitle = formData.get("variantTitle") || "";
      const propertiesStr = formData.get("properties") || "[]";
      const note = formData.get("note") || "";
      const quantity = parseInt(formData.get("quantity") || "1");

      let properties = [];
      try {
        properties = JSON.parse(propertiesStr);
      } catch (e) {
        properties = [];
      }

      // 解析数据
      const dimensions = parseCurtainDimensions(properties);
      const options = parseCurtainOptions(itemTitle, properties);
      
      const labelData = {
        orderNo: orderNo,
        fabricModel: parseFabricModel(itemTitle, properties, variantTitle),
        width: dimensions.width,
        height: dimensions.height,
        style: parseStyle(itemTitle, properties),
        lining: parseLining(itemTitle, properties),
        options: options,
        note: note,
        quantity: quantity,
      };

      // 如果数量大于1，生成多个水洗标
      let html;
      if (quantity > 1) {
        // 生成多个相同的水洗标
        const labels = Array(quantity).fill(labelData);
        html = generateMultiLabelHTML(labels);
      } else {
        html = generateWashLabelHTML(labelData);
      }
      
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
        },
      });
    }

    return json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    console.error("水洗标生成错误:", error);
    return json({ error: error.message || "生成失败" }, { status: 500 });
  }
};

export const loader = async ({ request }) => {
  return json({ message: "水洗标 API" });
};
