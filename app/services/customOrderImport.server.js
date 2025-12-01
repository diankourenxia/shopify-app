import * as XLSX from "xlsx";
import prisma from "../db.server";

const ORDER_TYPE_CONFIG = {
  DRAPERY: {
    sheetKeywords: ["布帘", "窗帘"],
    headerMap: {
      "订单编号": "orderNumber",
      "布料型号": "fabricModel",
      "布料采购米数": "purchaseMeters",
      "加工方式": "processingMethod",
      "成品布料高度": "finishedHeightCm",
      "墙宽": "wallWidthCm",
      "每片用料": "fabricPerPanel",
      "分片": "panelCount",
      "倍数": "fullnessRatio",
      "窗户数量": "windowCount",
      "是否定型": "isHeatSet",
      "衬布": "lining",
      "绑带": "tieback",
    },
    transform: (row) => ({
      orderNumber: asString(row.orderNumber),
      fabricModel: nullIfEmpty(row.fabricModel),
      purchaseMeters: asNumber(row.purchaseMeters),
      processingMethod: nullIfEmpty(row.processingMethod),
      finishedHeightCm: asNumber(row.finishedHeightCm),
      wallWidthCm: asNumber(row.wallWidthCm),
      fabricPerPanel: asNumber(row.fabricPerPanel),
      panelCount: asInt(row.panelCount),
      fullnessRatio: asNumber(row.fullnessRatio),
      windowCount: asInt(row.windowCount),
      isHeatSet: asBoolean(row.isHeatSet),
      lining: nullIfEmpty(row.lining),
      tieback: nullIfEmpty(row.tieback),
    }),
    relationalKey: "draperyLines",
  },
  ROMAN_SHADE: {
    sheetKeywords: ["罗马帘", "罗马"],
    headerMap: {
      "订单编号": "orderNumber",
      "订单状态": "orderStatus",
      "布料型号": "fabricModel",
      "布料采购米数": "purchaseMeters",
      "窗帘类型": "curtainType",
      "窗户宽度（cm）": "windowWidthCm",
      "窗户高度（cm）": "windowHeightCm",
      "窗帘数量": "curtainCount",
      "房间号": "roomNumber",
      "衬布": "lining",
      "包边": "edging",
      "无拉/电动/有绳": "controlType",
      "内嵌/外装": "mountingType",
      "打孔/免打孔": "grommetOption",
    },
    transform: (row) => ({
      orderNumber: asString(row.orderNumber),
      orderStatus: nullIfEmpty(row.orderStatus),
      fabricModel: nullIfEmpty(row.fabricModel),
      purchaseMeters: asNumber(row.purchaseMeters),
      curtainType: nullIfEmpty(row.curtainType),
      windowWidthCm: asNumber(row.windowWidthCm),
      windowHeightCm: asNumber(row.windowHeightCm),
      curtainCount: asInt(row.curtainCount),
      roomNumber: nullIfEmpty(row.roomNumber),
      lining: nullIfEmpty(row.lining),
      edging: nullIfEmpty(row.edging),
      controlType: nullIfEmpty(row.controlType),
      mountingType: nullIfEmpty(row.mountingType),
      grommetOption: nullIfEmpty(row.grommetOption),
    }),
    relationalKey: "romanShadeLines",
  },
  TRACK: {
    sheetKeywords: ["轨道"],
    headerMap: {
      "订单编号": "orderNumber",
      "轨道型号": "trackModel",
      "尺寸": "size",
      "数量": "quantity",
      "单开/双开": "openingType",
    },
    transform: (row) => ({
      orderNumber: asString(row.orderNumber),
      trackModel: nullIfEmpty(row.trackModel),
      size: nullIfEmpty(row.size),
      quantity: asInt(row.quantity),
      openingType: nullIfEmpty(row.openingType),
    }),
    relationalKey: "trackLines",
  },
  ROMAN_ROD: {
    sheetKeywords: ["罗马杆", "窗杆"],
    headerMap: {
      "订单编号": "orderNumber",
      "颜色": "color",
      "装饰头名称": "finialName",
      "尺寸": "size",
      "数量": "quantity",
      "是否要静音环": "needSilentRing",
    },
    transform: (row) => ({
      orderNumber: asString(row.orderNumber),
      color: nullIfEmpty(row.color),
      finialName: nullIfEmpty(row.finialName),
      size: nullIfEmpty(row.size),
      quantity: asInt(row.quantity),
      needSilentRing: asBoolean(row.needSilentRing),
    }),
    relationalKey: "romanRodLines",
  },
};

export function parseImportWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const result = {
    DRAPERY: [],
    ROMAN_SHADE: [],
    TRACK: [],
    ROMAN_ROD: [],
    warnings: [],
  };

  workbook.SheetNames.forEach((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return;

    const normalizedType = detectOrderType(sheetName);
    if (!normalizedType) {
      result.warnings.push(`未识别的工作表：${sheetName}`);
      return;
    }

    const { headerMap } = ORDER_TYPE_CONFIG[normalizedType];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    rows.forEach((row, idx) => {
      const normalizedRow = mapRow(row, headerMap);
      if (!normalizedRow.orderNumber) {
        result.warnings.push(`${sheetName} 第 ${idx + 2} 行缺少订单编号，已跳过`);
        return;
      }
      result[normalizedType].push({ ...normalizedRow, rawPayload: row });
    });
  });

  return result;
}

export async function createImportBatch({
  orderType,
  sourceType = "EXCEL",
  fileName,
  rows,
  createdBy,
}) {
  if (!rows?.length) {
    throw new Error("至少需要一条数据才能导入");
  }

  const config = ORDER_TYPE_CONFIG[orderType];
  if (!config) {
    throw new Error(`未知的订单类型：${orderType}`);
  }

  const mappedRows = rows.map((row) => ({
    ...config.transform(row),
    rawPayload: row.rawPayload ?? row,
  }));

  const relationalKey = config.relationalKey;
  const data = {
    orderType,
    sourceType,
    fileName,
    status: "COMPLETED",
    totalRows: mappedRows.length,
    successRows: mappedRows.length,
    failedRows: 0,
    createdBy,
    [relationalKey]: {
      create: mappedRows,
    },
  };

  return prisma.customOrderImport.create({ data, include: { [relationalKey]: true } });
}

export async function createImportsFromWorkbook({ buffer, fileName, createdBy }) {
  const parsed = parseImportWorkbook(buffer);
  const createdBatches = [];

  for (const orderType of Object.keys(ORDER_TYPE_CONFIG)) {
    const rows = parsed[orderType];
    if (!rows || rows.length === 0) continue;

    const batch = await createImportBatch({
      orderType,
      sourceType: "EXCEL",
      fileName,
      rows,
      createdBy,
    });
    createdBatches.push(batch);
  }

  if (createdBatches.length === 0) {
    throw new Error("未找到可导入的数据，请确认模板内容");
  }

  return { batches: createdBatches, warnings: parsed.warnings };
}

export async function createManualImport({ orderType, rows, createdBy }) {
  return createImportBatch({
    orderType,
    sourceType: "MANUAL",
    rows,
    createdBy,
  });
}

function mapRow(row, headerMap) {
  const result = {};
  Object.entries(headerMap).forEach(([header, field]) => {
    result[field] = row[header] ?? row[field] ?? "";
  });
  return result;
}

function detectOrderType(sheetName = "") {
  const name = sheetName.trim();
  for (const [type, cfg] of Object.entries(ORDER_TYPE_CONFIG)) {
    if (cfg.sheetKeywords.some((keyword) => name.includes(keyword))) {
      return type;
    }
  }
  return null;
}

const emptyPattern = /^\\s*$/;

function nullIfEmpty(value) {
  if (value === null || value === undefined) return null;
  const str = String(value);
  return emptyPattern.test(str) ? null : str.trim();
}

function asString(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).trim();
  return str;
}

function asNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(num) ? num : null;
}

function asInt(value) {
  const num = asNumber(value);
  return Number.isFinite(num) ? Math.round(num) : null;
}

function asBoolean(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim();
  if (["是", "yes", "true", "1"].includes(normalized)) return true;
  if (["否", "no", "false", "0"].includes(normalized)) return false;
  return null;
}
