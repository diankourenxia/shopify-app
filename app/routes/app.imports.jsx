import { useMemo, useState, useEffect, useCallback } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Button,
  Badge,
  Modal,
  RadioButton,
  Divider,
  Box,
  Collapsible,
  Select,
} from "@shopify/polaris";
import { ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import {
  createManualImport,
  createImportsFromWorkbook,
} from "../services/customOrderImport.server";

const ORDER_TYPE_OPTIONS = [
  { label: "布帘", value: "DRAPERY" },
  { label: "罗马帘", value: "ROMAN_SHADE" },
  { label: "轨道", value: "TRACK" },
  { label: "罗马杆", value: "ROMAN_ROD" },
];

// 是否定型选项
const HEAT_SET_OPTIONS = [
  { label: "是", value: "是" },
  { label: "否", value: "否" },
];

// 控制方式选项
const CONTROL_TYPE_OPTIONS = [
  { label: "无拉", value: "无拉" },
  { label: "电动", value: "电动" },
  { label: "有绳", value: "有绳" },
];

// 安装方式选项
const MOUNTING_TYPE_OPTIONS = [
  { label: "内嵌", value: "内嵌" },
  { label: "外装", value: "外装" },
];

// 打孔选项
const GROMMET_OPTIONS = [
  { label: "打孔", value: "打孔" },
  { label: "免打孔", value: "免打孔" },
];

// 开合方式选项
const OPENING_TYPE_OPTIONS = [
  { label: "单开", value: "单开" },
  { label: "双开", value: "双开" },
];

// 静音环选项
const SILENT_RING_OPTIONS = [
  { label: "是", value: "是" },
  { label: "否", value: "否" },
];

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);
  if (!admin) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const prisma = (await import("../db.server")).default;
  
  // 获取所有标签
  let allTags = [];
  try {
    allTags = await prisma.tag.findMany({
      orderBy: { name: 'asc' }
    });
  } catch (e) {
    console.error('获取标签失败:', e);
  }
  
  // 获取导入记录及其详细数据（包含标签）
  const imports = await prisma.customOrderImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      draperyLines: {
        include: { tags: { include: { tag: true } } }
      },
      romanShadeLines: {
        include: { tags: { include: { tag: true } } }
      },
      trackLines: {
        include: { tags: { include: { tag: true } } }
      },
      romanRodLines: {
        include: { tags: { include: { tag: true } } }
      },
    },
  });

  return json({ imports, allTags });
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  if (!admin) {
    return json({ error: "无权限" }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const createdBy = session?.shop || "system";
  const prisma = (await import("../db.server")).default;

  try {
    // 更新状态
    if (intent === "updateStatus") {
      const lineId = formData.get("lineId");
      const orderType = formData.get("orderType");
      const status = formData.get("status");
      const note = formData.get("note") || null;

      if (!lineId || !orderType) {
        return json({ error: "缺少必要参数" }, { status: 400 });
      }

      const modelMap = {
        DRAPERY: "draperyImportLine",
        ROMAN_SHADE: "romanShadeImportLine",
        TRACK: "trackImportLine",
        ROMAN_ROD: "romanRodImportLine",
      };

      const model = modelMap[orderType];
      if (!model) {
        return json({ error: "无效的订单类型" }, { status: 400 });
      }

      const updated = await prisma[model].update({
        where: { id: lineId },
        data: { status, note },
      });

      return json({ success: true, line: updated });
    }

    // 添加标签
    if (intent === "addTag") {
      const lineId = formData.get("lineId");
      const orderType = formData.get("orderType");
      const tagId = formData.get("tagId");

      if (!lineId || !orderType || !tagId) {
        return json({ error: "缺少必要参数" }, { status: 400 });
      }

      const fieldMap = {
        DRAPERY: "draperyLineId",
        ROMAN_SHADE: "romanShadeLineId",
        TRACK: "trackLineId",
        ROMAN_ROD: "romanRodLineId",
      };

      const field = fieldMap[orderType];
      if (!field) {
        return json({ error: "无效的订单类型" }, { status: 400 });
      }

      const importLineTag = await prisma.importLineTag.create({
        data: {
          tagId,
          [field]: lineId,
        },
        include: { tag: true },
      });

      return json({ success: true, importLineTag });
    }

    // 移除标签
    if (intent === "removeTag") {
      const lineId = formData.get("lineId");
      const orderType = formData.get("orderType");
      const tagId = formData.get("tagId");

      if (!lineId || !orderType || !tagId) {
        return json({ error: "缺少必要参数" }, { status: 400 });
      }

      const fieldMap = {
        DRAPERY: "draperyLineId",
        ROMAN_SHADE: "romanShadeLineId",
        TRACK: "trackLineId",
        ROMAN_ROD: "romanRodLineId",
      };

      const field = fieldMap[orderType];
      if (!field) {
        return json({ error: "无效的订单类型" }, { status: 400 });
      }

      await prisma.importLineTag.deleteMany({
        where: {
          tagId,
          [field]: lineId,
        },
      });

      return json({ success: true });
    }

    if (intent === "manual-import") {
      const orderType = formData.get("orderType");
      if (!orderType) {
        return json({ error: "请选择订单类型" }, { status: 400 });
      }
      const row = extractManualRow(orderType, formData);
      const result = await createManualImport({
        orderType,
        rows: [row],
        createdBy,
      });
      return json({
        success: true,
        message: "手动录入成功",
        importId: result.id,
      });
    }

    if (intent === "excel-import") {
      const uploadFile = formData.get("importFile");
      if (!uploadFile || typeof uploadFile === "string") {
        return json({ error: "请选择要上传的Excel文件" }, { status: 400 });
      }
      const arrayBuffer = await uploadFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const { batches, warnings } = await createImportsFromWorkbook({
        buffer,
        fileName: uploadFile.name,
        createdBy,
      });
      return json({
        success: true,
        message: `成功导入 ${batches.length} 个类型`,
        warnings,
      });
    }

    return json({ error: "未知操作" }, { status: 400 });
  } catch (error) {
    console.error("操作失败", error);
    if (error.code === 'P2002') {
      return json({ error: "该标签已添加" }, { status: 400 });
    }
    return json({ error: error.message || "操作失败" }, { status: 500 });
  }
}

function extractManualRow(orderType, formData) {
  const value = (key) => formData.get(key) || "";
  const numberValue = (key) => {
    const raw = value(key);
    if (raw === "") return null;
    const num = Number(raw);
    return Number.isFinite(num) ? num : null;
  };
  const intValue = (key) => {
    const num = numberValue(key);
    return Number.isFinite(num) ? Math.round(num) : null;
  };
  const boolValue = (key) => {
    const raw = value(key).toLowerCase();
    if (["true", "1", "yes", "是"].includes(raw)) return true;
    if (["false", "0", "no", "否"].includes(raw)) return false;
    return null;
  };

  const base = {
    orderNumber: value("orderNumber"),
    rawPayload: Object.fromEntries(formData.entries()),
  };

  switch (orderType) {
    case "DRAPERY":
      return {
        ...base,
        fabricModel: value("fabricModel"),
        purchaseMeters: numberValue("purchaseMeters"),
        processingMethod: value("processingMethod"),
        finishedHeightCm: numberValue("finishedHeight"),
        wallWidthCm: numberValue("wallWidth"),
        fabricPerPanel: numberValue("fabricPerPanel"),
        panelCount: intValue("panelCount"),
        fullnessRatio: numberValue("fullnessRatio"),
        windowCount: intValue("windowCount"),
        isHeatSet: boolValue("isHeatSet"),
        lining: value("lining"),
        tieback: value("tieback"),
      };
    case "ROMAN_SHADE":
      return {
        ...base,
        orderStatus: value("orderStatus"),
        fabricModel: value("fabricModel"),
        purchaseMeters: numberValue("purchaseMeters"),
        curtainType: value("curtainType"),
        windowWidthCm: numberValue("windowWidth"),
        windowHeightCm: numberValue("windowHeight"),
        curtainCount: intValue("curtainCount"),
        roomNumber: value("roomNumber"),
        lining: value("lining"),
        edging: value("edging"),
        controlType: value("controlType"),
        mountingType: value("mountingType"),
        grommetOption: value("grommetOption"),
      };
    case "TRACK":
      return {
        ...base,
        trackModel: value("trackModel"),
        size: value("size"),
        quantity: intValue("quantity"),
        openingType: value("openingType"),
      };
    case "ROMAN_ROD":
      return {
        ...base,
        color: value("color"),
        finialName: value("finialName"),
        size: value("size"),
        quantity: intValue("quantity"),
        needSilentRing: boolValue("needSilentRing"),
      };
    default:
      throw new Error(`暂不支持的订单类型：${orderType}`);
  }
}

// 订单状态选项
const STATUS_OPTIONS = [
  { label: "选择状态", value: "" },
  { label: "待生产", value: "待生产" },
  { label: "生产中", value: "生产中" },
  { label: "暂停生产", value: "暂停生产" },
  { label: "待发货", value: "待发货" },
  { label: "已发货", value: "已发货" },
];

export default function ImportCenter() {
  const { imports, allTags } = useLoaderData();
  const manualFetcher = useFetcher();
  const excelFetcher = useFetcher();
  const statusFetcher = useFetcher();
  const tagFetcher = useFetcher();
  
  // 弹窗状态
  const [showManualModal, setShowManualModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  
  // 展开状态 - 记录哪些导入记录被展开
  const [expandedImports, setExpandedImports] = useState(new Set());
  
  // 筛选状态
  const [typeFilter, setTypeFilter] = useState("all");
  const [customStatusFilter, setCustomStatusFilter] = useState("all");
  
  // 本地状态和备注管理
  const [localStatusMap, setLocalStatusMap] = useState({});
  const [localNoteMap, setLocalNoteMap] = useState({});
  const [localTagsMap, setLocalTagsMap] = useState({});
  
  // 表单状态
  const [manualOrderType, setManualOrderType] = useState("DRAPERY");
  const [manualFormValues, setManualFormValues] = useState({});

  // 获取导入记录的行数据 - 定义在useEffect之前
  const getImportLines = (importItem) => {
    switch (importItem.orderType) {
      case "DRAPERY":
        return importItem.draperyLines || [];
      case "ROMAN_SHADE":
        return importItem.romanShadeLines || [];
      case "TRACK":
        return importItem.trackLines || [];
      case "ROMAN_ROD":
        return importItem.romanRodLines || [];
      default:
        return [];
    }
  };

  // 初始化本地状态
  useEffect(() => {
    const statusMap = {};
    const noteMap = {};
    const tagsMap = {};
    
    imports.forEach(imp => {
      const lines = getImportLines(imp);
      lines.forEach(line => {
        const key = `${imp.orderType}:${line.id}`;
        statusMap[key] = line.status || "";
        noteMap[key] = line.note || "";
        tagsMap[key] = (line.tags || []).map(t => t.tag);
      });
    });
    
    setLocalStatusMap(statusMap);
    setLocalNoteMap(noteMap);
    setLocalTagsMap(tagsMap);
  }, [imports]);

  // 成功后关闭弹窗并重置表单
  useEffect(() => {
    if (manualFetcher.state === "idle" && manualFetcher.data?.success) {
      setManualFormValues({});
      setShowManualModal(false);
    }
  }, [manualFetcher.state, manualFetcher.data]);

  useEffect(() => {
    if (excelFetcher.state === "idle" && excelFetcher.data?.success) {
      setShowExcelModal(false);
    }
  }, [excelFetcher.state, excelFetcher.data]);

  // 处理标签操作结果
  useEffect(() => {
    if (tagFetcher.data?.success && tagFetcher.data?.importLineTag) {
      const { importLineTag } = tagFetcher.data;
      const lineId = importLineTag.draperyLineId || importLineTag.romanShadeLineId || 
                     importLineTag.trackLineId || importLineTag.romanRodLineId;
      // 查找对应的订单类型
      let orderType = "";
      if (importLineTag.draperyLineId) orderType = "DRAPERY";
      else if (importLineTag.romanShadeLineId) orderType = "ROMAN_SHADE";
      else if (importLineTag.trackLineId) orderType = "TRACK";
      else if (importLineTag.romanRodLineId) orderType = "ROMAN_ROD";
      
      const key = `${orderType}:${lineId}`;
      setLocalTagsMap(prev => ({
        ...prev,
        [key]: [...(prev[key] || []), importLineTag.tag]
      }));
    }
  }, [tagFetcher.data]);

  const handleManualChange = useCallback((name) => (value) => {
    setManualFormValues((prev) => ({ ...prev, [name]: value }));
  }, []);
  
  const manualValue = useCallback((name) => manualFormValues[name] ?? "", [manualFormValues]);

  const typeLabelMap = {
    DRAPERY: "布帘",
    ROMAN_SHADE: "罗马帘",
    TRACK: "轨道",
    ROMAN_ROD: "罗马杆",
  };

  const sourceLabelMap = {
    MANUAL: "手动",
    EXCEL: "Excel",
  };

  // 切换展开状态
  const toggleExpand = useCallback((importId) => {
    setExpandedImports(prev => {
      const newSet = new Set(prev);
      if (newSet.has(importId)) {
        newSet.delete(importId);
      } else {
        newSet.add(importId);
      }
      return newSet;
    });
  }, []);

  // 处理状态更新
  const handleStatusChange = useCallback((orderType, lineId, newStatus) => {
    const key = `${orderType}:${lineId}`;
    setLocalStatusMap(prev => ({ ...prev, [key]: newStatus }));
    
    const formData = new FormData();
    formData.append("intent", "updateStatus");
    formData.append("orderType", orderType);
    formData.append("lineId", lineId);
    formData.append("status", newStatus);
    formData.append("note", localNoteMap[key] || "");
    statusFetcher.submit(formData, { method: "POST" });
  }, [localNoteMap, statusFetcher]);

  // 处理备注更新
  const handleNoteChange = useCallback((orderType, lineId, newNote) => {
    const key = `${orderType}:${lineId}`;
    setLocalNoteMap(prev => ({ ...prev, [key]: newNote }));
  }, []);

  const handleNoteBlur = useCallback((orderType, lineId) => {
    const key = `${orderType}:${lineId}`;
    const status = localStatusMap[key];
    const note = localNoteMap[key];
    
    if (!status) return; // 没有状态不保存
    
    const formData = new FormData();
    formData.append("intent", "updateStatus");
    formData.append("orderType", orderType);
    formData.append("lineId", lineId);
    formData.append("status", status);
    formData.append("note", note || "");
    statusFetcher.submit(formData, { method: "POST" });
  }, [localStatusMap, localNoteMap, statusFetcher]);

  // 添加标签
  const handleAddTag = useCallback((orderType, lineId, tagId) => {
    const formData = new FormData();
    formData.append("intent", "addTag");
    formData.append("orderType", orderType);
    formData.append("lineId", lineId);
    formData.append("tagId", tagId);
    tagFetcher.submit(formData, { method: "POST" });
  }, [tagFetcher]);

  // 移除标签
  const handleRemoveTag = useCallback((orderType, lineId, tagId) => {
    const key = `${orderType}:${lineId}`;
    // 立即更新本地状态
    setLocalTagsMap(prev => ({
      ...prev,
      [key]: (prev[key] || []).filter(t => t.id !== tagId)
    }));
    
    const formData = new FormData();
    formData.append("intent", "removeTag");
    formData.append("orderType", orderType);
    formData.append("lineId", lineId);
    formData.append("tagId", tagId);
    tagFetcher.submit(formData, { method: "POST" });
  }, [tagFetcher]);

  // 筛选后的导入记录
  const filteredImports = useMemo(() => {
    let result = imports;
    
    // 类型筛选
    if (typeFilter !== "all") {
      result = result.filter(item => item.orderType === typeFilter);
    }
    
    // 状态筛选
    if (customStatusFilter !== "all") {
      result = result.map(imp => {
        const lines = getImportLines(imp);
        const filteredLines = lines.filter(line => {
          const key = `${imp.orderType}:${line.id}`;
          return localStatusMap[key] === customStatusFilter;
        });
        
        // 只返回有匹配行的导入记录
        if (filteredLines.length === 0) return null;
        
        // 返回带有筛选后行数据的导入记录
        const newImp = { ...imp };
        switch (imp.orderType) {
          case "DRAPERY":
            newImp.draperyLines = filteredLines;
            break;
          case "ROMAN_SHADE":
            newImp.romanShadeLines = filteredLines;
            break;
          case "TRACK":
            newImp.trackLines = filteredLines;
            break;
          case "ROMAN_ROD":
            newImp.romanRodLines = filteredLines;
            break;
        }
        return newImp;
      }).filter(Boolean);
    }
    
    return result;
  }, [imports, typeFilter, customStatusFilter, localStatusMap]);

  const openManualModal = useCallback(() => {
    setManualFormValues({});
    setShowManualModal(true);
  }, []);

  const openExcelModal = useCallback(() => {
    setShowExcelModal(true);
  }, []);

  return (
    <Page title="订单导入中心" subtitle="支持布帘/罗马帘/轨道/罗马杆的手动录入与Excel导入">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack gap="300" align="space-between">
                <InlineStack gap="300">
                  <Button variant="primary" onClick={openManualModal}>
                    手动录入
                  </Button>
                  <Button onClick={openExcelModal}>
                    Excel 导入
                  </Button>
                </InlineStack>
                
                <InlineStack gap="200">
                  <Box minWidth="120px">
                    <Select
                      label="类型"
                      labelHidden
                      options={[
                        { label: "全部类型", value: "all" },
                        { label: "布帘", value: "DRAPERY" },
                        { label: "罗马帘", value: "ROMAN_SHADE" },
                        { label: "轨道", value: "TRACK" },
                        { label: "罗马杆", value: "ROMAN_ROD" },
                      ]}
                      value={typeFilter}
                      onChange={setTypeFilter}
                    />
                  </Box>
                  <Box minWidth="120px">
                    <Select
                      label="状态"
                      labelHidden
                      options={[
                        { label: "全部状态", value: "all" },
                        { label: "待生产", value: "待生产" },
                        { label: "生产中", value: "生产中" },
                        { label: "暂停生产", value: "暂停生产" },
                        { label: "待发货", value: "待发货" },
                        { label: "已发货", value: "已发货" },
                      ]}
                      value={customStatusFilter}
                      onChange={setCustomStatusFilter}
                    />
                  </Box>
                </InlineStack>
              </InlineStack>
              
              {/* 显示最近操作结果 */}
              {manualFetcher.data?.success && (
                <Text tone="success">{manualFetcher.data.message}</Text>
              )}
              {excelFetcher.data?.success && (
                <BlockStack gap="200">
                  <Text tone="success">{excelFetcher.data.message}</Text>
                  {excelFetcher.data.warnings?.length ? (
                    <BlockStack gap="100">
                      <Text tone="subdued">提示：</Text>
                      {excelFetcher.data.warnings.map((warn, idx) => (
                        <Text key={idx} tone="subdued">• {warn}</Text>
                      ))}
                    </BlockStack>
                  ) : null}
                </BlockStack>
              )}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="400">
            <Text variant="headingMd">导入记录 ({filteredImports.length})</Text>
            
            {filteredImports.length === 0 ? (
              <Card>
                <Text tone="subdued">暂无导入记录</Text>
              </Card>
            ) : (
              filteredImports.map((importItem) => {
                const lines = getImportLines(importItem);
                const isExpanded = expandedImports.has(importItem.id);
                
                return (
                  <Card key={importItem.id}>
                    <BlockStack gap="300">
                      {/* 导入记录头部 */}
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="300" blockAlign="center">
                          <Badge tone={importItem.orderType === "DRAPERY" ? "info" : importItem.orderType === "ROMAN_SHADE" ? "warning" : importItem.orderType === "TRACK" ? "success" : "attention"}>
                            {typeLabelMap[importItem.orderType] || importItem.orderType}
                          </Badge>
                          <Badge tone={importItem.sourceType === "MANUAL" ? "info" : "success"}>
                            {sourceLabelMap[importItem.sourceType] || importItem.sourceType}
                          </Badge>
                          {renderStatus(importItem.status)}
                        </InlineStack>
                        
                        <InlineStack gap="200" blockAlign="center">
                          <Text variant="bodySm" tone="subdued">
                            {new Date(importItem.createdAt).toLocaleString("zh-CN")}
                          </Text>
                          <Text variant="bodySm">
                            {importItem.successRows}/{importItem.totalRows} 条
                          </Text>
                          <Button
                            variant="plain"
                            onClick={() => toggleExpand(importItem.id)}
                            icon={isExpanded ? ChevronUpIcon : ChevronDownIcon}
                          >
                            {isExpanded ? "收起" : "展开详情"}
                          </Button>
                        </InlineStack>
                      </InlineStack>

                      {importItem.fileName && (
                        <Text variant="bodySm" tone="subdued">
                          文件: {importItem.fileName}
                        </Text>
                      )}

                      {/* 展开的详细内容 */}
                      <Collapsible open={isExpanded} id={`import-${importItem.id}`}>
                        <Box paddingBlockStart="300">
                          <Divider />
                          <Box paddingBlockStart="300">
                            {lines.length === 0 ? (
                              <Text tone="subdued">暂无数据</Text>
                            ) : (
                              <BlockStack gap="400">
                                {lines.map((line, index) => {
                                  const lineKey = `${importItem.orderType}:${line.id}`;
                                  const currentStatus = localStatusMap[lineKey] || "";
                                  const currentNote = localNoteMap[lineKey] || "";
                                  const lineTags = localTagsMap[lineKey] || [];
                                  const availableTags = allTags.filter(
                                    tag => !lineTags.some(t => t.id === tag.id)
                                  );
                                  
                                  return (
                                    <Box key={line.id} padding="300" background="bg-surface-secondary" borderRadius="200">
                                      <BlockStack gap="300">
                                        {/* 基本信息 */}
                                        {renderLineDetail(importItem.orderType, line, index)}
                                        
                                        <Divider />
                                        
                                        {/* 状态和备注管理 */}
                                        <InlineStack gap="300" wrap>
                                          <Box minWidth="150px">
                                            <Select
                                              label="订单状态"
                                              options={STATUS_OPTIONS}
                                              value={currentStatus}
                                              onChange={(value) => handleStatusChange(importItem.orderType, line.id, value)}
                                            />
                                          </Box>
                                          <Box minWidth="200px" maxWidth="300px">
                                            <TextField
                                              label="备注"
                                              value={currentNote}
                                              onChange={(value) => handleNoteChange(importItem.orderType, line.id, value)}
                                              onBlur={() => handleNoteBlur(importItem.orderType, line.id)}
                                              autoComplete="off"
                                              multiline={1}
                                            />
                                          </Box>
                                        </InlineStack>
                                        
                                        {/* 标签管理 */}
                                        <BlockStack gap="200">
                                          <Text variant="bodySm" fontWeight="semibold">标签</Text>
                                          <InlineStack gap="200" wrap>
                                            {lineTags.map(tag => (
                                              <Badge
                                                key={tag.id}
                                                tone="info"
                                              >
                                                <InlineStack gap="100" blockAlign="center">
                                                  <span style={{ 
                                                    width: 8, 
                                                    height: 8, 
                                                    borderRadius: '50%', 
                                                    backgroundColor: tag.color,
                                                    display: 'inline-block'
                                                  }} />
                                                  {tag.name}
                                                  <Button
                                                    variant="plain"
                                                    size="micro"
                                                    onClick={() => handleRemoveTag(importItem.orderType, line.id, tag.id)}
                                                  >
                                                    ✕
                                                  </Button>
                                                </InlineStack>
                                              </Badge>
                                            ))}
                                            {availableTags.length > 0 && (
                                              <Select
                                                label="添加标签"
                                                labelHidden
                                                options={[
                                                  { label: "+ 添加标签", value: "" },
                                                  ...availableTags.map(tag => ({
                                                    label: tag.name,
                                                    value: tag.id,
                                                  }))
                                                ]}
                                                value=""
                                                onChange={(tagId) => {
                                                  if (tagId) {
                                                    handleAddTag(importItem.orderType, line.id, tagId);
                                                  }
                                                }}
                                              />
                                            )}
                                          </InlineStack>
                                        </BlockStack>
                                      </BlockStack>
                                    </Box>
                                  );
                                })}
                              </BlockStack>
                            )}
                          </Box>
                        </Box>
                      </Collapsible>
                    </BlockStack>
                  </Card>
                );
              })
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      {/* 手动录入弹窗 */}
      <Modal
        open={showManualModal}
        onClose={() => setShowManualModal(false)}
        title="手动录入订单"
        primaryAction={{
          content: "保存",
          loading: manualFetcher.state !== "idle",
          onAction: () => {
            const form = document.getElementById("manual-import-form");
            if (form) form.requestSubmit();
          },
        }}
        secondaryActions={[
          {
            content: "取消",
            onAction: () => setShowManualModal(false),
          },
        ]}
        large
      >
        <Modal.Section>
          <manualFetcher.Form method="post" id="manual-import-form">
            <input type="hidden" name="intent" value="manual-import" />
            <input type="hidden" name="orderType" value={manualOrderType} />
            <BlockStack gap="400">
              {/* 订单类型单选 */}
              <BlockStack gap="200">
                <Text variant="headingSm">订单类型</Text>
                <InlineStack gap="400">
                  {ORDER_TYPE_OPTIONS.map((opt) => (
                    <RadioButton
                      key={opt.value}
                      label={opt.label}
                      checked={manualOrderType === opt.value}
                      id={`orderType-${opt.value}`}
                      name="orderTypeRadio"
                      onChange={() => {
                        setManualOrderType(opt.value);
                        setManualFormValues({});
                      }}
                    />
                  ))}
                </InlineStack>
              </BlockStack>

              <Divider />

              {/* 订单编号 */}
              <TextField
                label="订单编号"
                name="orderNumber"
                autoComplete="off"
                value={manualValue("orderNumber")}
                onChange={handleManualChange("orderNumber")}
                requiredIndicator
              />

              {/* 根据类型显示不同字段 */}
              {renderManualFields(manualOrderType, manualValue, handleManualChange)}

              {manualFetcher.data?.error && (
                <Text tone="critical">{manualFetcher.data.error}</Text>
              )}
            </BlockStack>
          </manualFetcher.Form>
        </Modal.Section>
      </Modal>

      {/* Excel 导入弹窗 */}
      <Modal
        open={showExcelModal}
        onClose={() => setShowExcelModal(false)}
        title="Excel 导入"
        primaryAction={{
          content: "上传并导入",
          loading: excelFetcher.state !== "idle",
          onAction: () => {
            const form = document.getElementById("excel-import-form");
            if (form) form.requestSubmit();
          },
        }}
        secondaryActions={[
          {
            content: "取消",
            onAction: () => setShowExcelModal(false),
          },
        ]}
      >
        <Modal.Section>
          <excelFetcher.Form method="post" encType="multipart/form-data" id="excel-import-form">
            <input type="hidden" name="intent" value="excel-import" />
            <BlockStack gap="400">
              <label>
                <Text variant="bodyMd" fontWeight="semibold">
                  上传Excel文件
                </Text>
                <Box paddingBlockStart="200">
                  <input type="file" name="importFile" accept=".xlsx,.xls" />
                </Box>
              </label>
              <Text variant="bodySm" tone="subdued">
                支持按模板上传四种类型的订单（布帘/罗马帘/轨道/罗马杆），系统将按工作表名称自动识别。
              </Text>
              {excelFetcher.data?.error && (
                <Text tone="critical">{excelFetcher.data.error}</Text>
              )}
            </BlockStack>
          </excelFetcher.Form>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

function renderManualFields(orderType, valueGetter, changeGetter) {
  switch (orderType) {
    case "DRAPERY":
      return (
        <BlockStack gap="300">
          <TextField
            label="布料型号"
            name="fabricModel"
            autoComplete="off"
            value={valueGetter("fabricModel")}
            onChange={changeGetter("fabricModel")}
          />
          <TextField
            label="布料采购米数"
            name="purchaseMeters"
            type="number"
            autoComplete="off"
            value={valueGetter("purchaseMeters")}
            onChange={changeGetter("purchaseMeters")}
          />
          <TextField
            label="加工方式"
            name="processingMethod"
            autoComplete="off"
            value={valueGetter("processingMethod")}
            onChange={changeGetter("processingMethod")}
          />
          <InlineStack gap="300">
            <Box minWidth="120px">
              <TextField
                label="成品高度(cm)"
                name="finishedHeight"
                type="number"
                autoComplete="off"
                value={valueGetter("finishedHeight")}
                onChange={changeGetter("finishedHeight")}
              />
            </Box>
            <Box minWidth="120px">
              <TextField
                label="墙宽(cm)"
                name="wallWidth"
                type="number"
                autoComplete="off"
                value={valueGetter("wallWidth")}
                onChange={changeGetter("wallWidth")}
              />
            </Box>
          </InlineStack>
          <InlineStack gap="300">
            <Box minWidth="120px">
              <TextField
                label="每片用料"
                name="fabricPerPanel"
                type="number"
                autoComplete="off"
                value={valueGetter("fabricPerPanel")}
                onChange={changeGetter("fabricPerPanel")}
              />
            </Box>
            <Box minWidth="120px">
              <TextField
                label="分片"
                name="panelCount"
                type="number"
                autoComplete="off"
                value={valueGetter("panelCount")}
                onChange={changeGetter("panelCount")}
              />
            </Box>
          </InlineStack>
          <InlineStack gap="300">
            <Box minWidth="120px">
              <TextField
                label="倍数"
                name="fullnessRatio"
                type="number"
                autoComplete="off"
                value={valueGetter("fullnessRatio")}
                onChange={changeGetter("fullnessRatio")}
              />
            </Box>
            <Box minWidth="120px">
              <TextField
                label="窗户数量"
                name="windowCount"
                type="number"
                autoComplete="off"
                value={valueGetter("windowCount")}
                onChange={changeGetter("windowCount")}
              />
            </Box>
          </InlineStack>
          
          {/* 是否定型 - 单选 */}
          <BlockStack gap="200">
            <Text variant="bodyMd">是否定型</Text>
            <input type="hidden" name="isHeatSet" value={valueGetter("isHeatSet")} />
            <InlineStack gap="400">
              {HEAT_SET_OPTIONS.map((opt) => (
                <RadioButton
                  key={opt.value}
                  label={opt.label}
                  checked={valueGetter("isHeatSet") === opt.value}
                  id={`isHeatSet-${opt.value}`}
                  name="isHeatSetRadio"
                  onChange={() => changeGetter("isHeatSet")(opt.value)}
                />
              ))}
            </InlineStack>
          </BlockStack>

          <InlineStack gap="300">
            <Box minWidth="120px">
              <TextField
                label="衬布"
                name="lining"
                autoComplete="off"
                value={valueGetter("lining")}
                onChange={changeGetter("lining")}
              />
            </Box>
            <Box minWidth="120px">
              <TextField
                label="绑带"
                name="tieback"
                autoComplete="off"
                value={valueGetter("tieback")}
                onChange={changeGetter("tieback")}
              />
            </Box>
          </InlineStack>
        </BlockStack>
      );

    case "ROMAN_SHADE":
      return (
        <BlockStack gap="300">
          <TextField
            label="订单状态"
            name="orderStatus"
            autoComplete="off"
            value={valueGetter("orderStatus")}
            onChange={changeGetter("orderStatus")}
          />
          <TextField
            label="布料型号"
            name="fabricModel"
            autoComplete="off"
            value={valueGetter("fabricModel")}
            onChange={changeGetter("fabricModel")}
          />
          <TextField
            label="布料采购米数"
            name="purchaseMeters"
            type="number"
            autoComplete="off"
            value={valueGetter("purchaseMeters")}
            onChange={changeGetter("purchaseMeters")}
          />
          <TextField
            label="窗帘类型"
            name="curtainType"
            autoComplete="off"
            value={valueGetter("curtainType")}
            onChange={changeGetter("curtainType")}
          />
          <InlineStack gap="300">
            <Box minWidth="120px">
              <TextField
                label="窗户宽度(cm)"
                name="windowWidth"
                type="number"
                autoComplete="off"
                value={valueGetter("windowWidth")}
                onChange={changeGetter("windowWidth")}
              />
            </Box>
            <Box minWidth="120px">
              <TextField
                label="窗户高度(cm)"
                name="windowHeight"
                type="number"
                autoComplete="off"
                value={valueGetter("windowHeight")}
                onChange={changeGetter("windowHeight")}
              />
            </Box>
          </InlineStack>
          <InlineStack gap="300">
            <Box minWidth="120px">
              <TextField
                label="窗帘数量"
                name="curtainCount"
                type="number"
                autoComplete="off"
                value={valueGetter("curtainCount")}
                onChange={changeGetter("curtainCount")}
              />
            </Box>
            <Box minWidth="120px">
              <TextField
                label="房间号"
                name="roomNumber"
                autoComplete="off"
                value={valueGetter("roomNumber")}
                onChange={changeGetter("roomNumber")}
              />
            </Box>
          </InlineStack>
          <InlineStack gap="300">
            <Box minWidth="120px">
              <TextField
                label="衬布"
                name="lining"
                autoComplete="off"
                value={valueGetter("lining")}
                onChange={changeGetter("lining")}
              />
            </Box>
            <Box minWidth="120px">
              <TextField
                label="包边"
                name="edging"
                autoComplete="off"
                value={valueGetter("edging")}
                onChange={changeGetter("edging")}
              />
            </Box>
          </InlineStack>

          {/* 控制方式 - 单选 */}
          <BlockStack gap="200">
            <Text variant="bodyMd">控制方式</Text>
            <input type="hidden" name="controlType" value={valueGetter("controlType")} />
            <InlineStack gap="400">
              {CONTROL_TYPE_OPTIONS.map((opt) => (
                <RadioButton
                  key={opt.value}
                  label={opt.label}
                  checked={valueGetter("controlType") === opt.value}
                  id={`controlType-${opt.value}`}
                  name="controlTypeRadio"
                  onChange={() => changeGetter("controlType")(opt.value)}
                />
              ))}
            </InlineStack>
          </BlockStack>

          {/* 安装方式 - 单选 */}
          <BlockStack gap="200">
            <Text variant="bodyMd">安装方式</Text>
            <input type="hidden" name="mountingType" value={valueGetter("mountingType")} />
            <InlineStack gap="400">
              {MOUNTING_TYPE_OPTIONS.map((opt) => (
                <RadioButton
                  key={opt.value}
                  label={opt.label}
                  checked={valueGetter("mountingType") === opt.value}
                  id={`mountingType-${opt.value}`}
                  name="mountingTypeRadio"
                  onChange={() => changeGetter("mountingType")(opt.value)}
                />
              ))}
            </InlineStack>
          </BlockStack>

          {/* 打孔/免打孔 - 单选 */}
          <BlockStack gap="200">
            <Text variant="bodyMd">打孔方式</Text>
            <input type="hidden" name="grommetOption" value={valueGetter("grommetOption")} />
            <InlineStack gap="400">
              {GROMMET_OPTIONS.map((opt) => (
                <RadioButton
                  key={opt.value}
                  label={opt.label}
                  checked={valueGetter("grommetOption") === opt.value}
                  id={`grommetOption-${opt.value}`}
                  name="grommetOptionRadio"
                  onChange={() => changeGetter("grommetOption")(opt.value)}
                />
              ))}
            </InlineStack>
          </BlockStack>
        </BlockStack>
      );

    case "TRACK":
      return (
        <BlockStack gap="300">
          <TextField
            label="轨道型号"
            name="trackModel"
            autoComplete="off"
            value={valueGetter("trackModel")}
            onChange={changeGetter("trackModel")}
          />
          <TextField
            label="尺寸"
            name="size"
            autoComplete="off"
            value={valueGetter("size")}
            onChange={changeGetter("size")}
          />
          <TextField
            label="数量"
            name="quantity"
            type="number"
            autoComplete="off"
            value={valueGetter("quantity")}
            onChange={changeGetter("quantity")}
          />

          {/* 单开/双开 - 单选 */}
          <BlockStack gap="200">
            <Text variant="bodyMd">开合方式</Text>
            <input type="hidden" name="openingType" value={valueGetter("openingType")} />
            <InlineStack gap="400">
              {OPENING_TYPE_OPTIONS.map((opt) => (
                <RadioButton
                  key={opt.value}
                  label={opt.label}
                  checked={valueGetter("openingType") === opt.value}
                  id={`openingType-${opt.value}`}
                  name="openingTypeRadio"
                  onChange={() => changeGetter("openingType")(opt.value)}
                />
              ))}
            </InlineStack>
          </BlockStack>
        </BlockStack>
      );

    case "ROMAN_ROD":
      return (
        <BlockStack gap="300">
          <TextField
            label="颜色"
            name="color"
            autoComplete="off"
            value={valueGetter("color")}
            onChange={changeGetter("color")}
          />
          <TextField
            label="装饰头名称"
            name="finialName"
            autoComplete="off"
            value={valueGetter("finialName")}
            onChange={changeGetter("finialName")}
          />
          <TextField
            label="尺寸"
            name="size"
            autoComplete="off"
            value={valueGetter("size")}
            onChange={changeGetter("size")}
          />
          <TextField
            label="数量"
            name="quantity"
            type="number"
            autoComplete="off"
            value={valueGetter("quantity")}
            onChange={changeGetter("quantity")}
          />

          {/* 是否要静音环 - 单选 */}
          <BlockStack gap="200">
            <Text variant="bodyMd">是否要静音环</Text>
            <input type="hidden" name="needSilentRing" value={valueGetter("needSilentRing")} />
            <InlineStack gap="400">
              {SILENT_RING_OPTIONS.map((opt) => (
                <RadioButton
                  key={opt.value}
                  label={opt.label}
                  checked={valueGetter("needSilentRing") === opt.value}
                  id={`needSilentRing-${opt.value}`}
                  name="needSilentRingRadio"
                  onChange={() => changeGetter("needSilentRing")(opt.value)}
                />
              ))}
            </InlineStack>
          </BlockStack>
        </BlockStack>
      );

    default:
      return null;
  }
}

function renderStatus(status) {
  const toneMap = {
    COMPLETED: "success",
    FAILED: "critical",
    PENDING: "attention",
  };
  const labelMap = {
    COMPLETED: "完成",
    FAILED: "失败",
    PENDING: "处理中",
  };
  return <Badge tone={toneMap[status] || "info"}>{labelMap[status] || status}</Badge>;
}

// 渲染单行详情
function renderLineDetail(orderType, line, index) {
  const InfoItem = ({ label, value }) => (
    value ? (
      <Box minWidth="100px">
        <BlockStack gap="100">
          <Text variant="bodySm" tone="subdued">{label}</Text>
          <Text variant="bodyMd" fontWeight="semibold">{value}</Text>
        </BlockStack>
      </Box>
    ) : null
  );

  switch (orderType) {
    case "DRAPERY":
      return (
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm">#{index + 1}</Text>
            <Badge>{line.orderNumber || "无订单号"}</Badge>
          </InlineStack>
          
          <InlineStack gap="400" wrap>
            <InfoItem label="布料型号" value={line.fabricModel} />
            <InfoItem label="采购米数" value={line.purchaseMeters?.toFixed(2)} />
            <InfoItem label="加工方式" value={line.processingMethod} />
          </InlineStack>
          
          <InlineStack gap="400" wrap>
            <InfoItem label="成品高度" value={line.finishedHeightCm ? `${line.finishedHeightCm}cm` : null} />
            <InfoItem label="墙宽" value={line.wallWidthCm ? `${line.wallWidthCm}cm` : null} />
            <InfoItem label="每片用料" value={line.fabricPerPanel?.toString()} />
          </InlineStack>
          
          <InlineStack gap="400" wrap>
            <InfoItem label="分片" value={line.panelCount?.toString()} />
            <InfoItem label="倍数" value={line.fullnessRatio?.toString()} />
            <InfoItem label="窗户数量" value={line.windowCount?.toString()} />
          </InlineStack>
          
          <InlineStack gap="400" wrap>
            <InfoItem label="是否定型" value={line.isHeatSet === true ? "是" : line.isHeatSet === false ? "否" : null} />
            <InfoItem label="衬布" value={line.lining} />
            <InfoItem label="绑带" value={line.tieback} />
          </InlineStack>
        </BlockStack>
      );

    case "ROMAN_SHADE":
      return (
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm">#{index + 1}</Text>
            <Badge>{line.orderNumber || "无订单号"}</Badge>
            {line.orderStatus && <Badge tone="info">{line.orderStatus}</Badge>}
          </InlineStack>
          
          <InlineStack gap="400" wrap>
            <InfoItem label="布料型号" value={line.fabricModel} />
            <InfoItem label="采购米数" value={line.purchaseMeters?.toFixed(2)} />
            <InfoItem label="窗帘类型" value={line.curtainType} />
          </InlineStack>
          
          <InlineStack gap="400" wrap>
            <InfoItem label="窗户宽度" value={line.windowWidthCm ? `${line.windowWidthCm}cm` : null} />
            <InfoItem label="窗户高度" value={line.windowHeightCm ? `${line.windowHeightCm}cm` : null} />
            <InfoItem label="窗帘数量" value={line.curtainCount?.toString()} />
          </InlineStack>
          
          <InlineStack gap="400" wrap>
            <InfoItem label="房间号" value={line.roomNumber} />
            <InfoItem label="衬布" value={line.lining} />
            <InfoItem label="包边" value={line.edging} />
          </InlineStack>
          
          <InlineStack gap="400" wrap>
            <InfoItem label="控制方式" value={line.controlType} />
            <InfoItem label="安装方式" value={line.mountingType} />
            <InfoItem label="打孔方式" value={line.grommetOption} />
          </InlineStack>
        </BlockStack>
      );

    case "TRACK":
      return (
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm">#{index + 1}</Text>
            <Badge>{line.orderNumber || "无订单号"}</Badge>
          </InlineStack>
          
          <InlineStack gap="400" wrap>
            <InfoItem label="轨道型号" value={line.trackModel} />
            <InfoItem label="尺寸" value={line.size} />
            <InfoItem label="数量" value={line.quantity?.toString()} />
            <InfoItem label="开合方式" value={line.openingType} />
          </InlineStack>
        </BlockStack>
      );

    case "ROMAN_ROD":
      return (
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center">
            <Text variant="headingSm">#{index + 1}</Text>
            <Badge>{line.orderNumber || "无订单号"}</Badge>
          </InlineStack>
          
          <InlineStack gap="400" wrap>
            <InfoItem label="颜色" value={line.color} />
            <InfoItem label="装饰头名称" value={line.finialName} />
            <InfoItem label="尺寸" value={line.size} />
            <InfoItem label="数量" value={line.quantity?.toString()} />
            <InfoItem label="静音环" value={line.needSilentRing === true ? "是" : line.needSilentRing === false ? "否" : null} />
          </InlineStack>
        </BlockStack>
      );

    default:
      return <Text tone="subdued">未知类型</Text>;
  }
}
