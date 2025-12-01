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
  DataTable,
  Badge,
  Modal,
  RadioButton,
  Divider,
  Box,
} from "@shopify/polaris";
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
  const imports = await prisma.customOrderImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return json({ imports });
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  if (!admin) {
    return json({ error: "无权限" }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const createdBy = session?.shop || "system";

  try {
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
    console.error("导入失败", error);
    return json({ error: error.message || "导入失败" }, { status: 500 });
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

export default function ImportCenter() {
  const { imports } = useLoaderData();
  const manualFetcher = useFetcher();
  const excelFetcher = useFetcher();
  
  // 弹窗状态
  const [showManualModal, setShowManualModal] = useState(false);
  const [showExcelModal, setShowExcelModal] = useState(false);
  
  // 表单状态
  const [manualOrderType, setManualOrderType] = useState("DRAPERY");
  const [manualFormValues, setManualFormValues] = useState({});

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

  const tableRows = useMemo(() => {
    return imports.map((item) => [
      typeLabelMap[item.orderType] || item.orderType,
      sourceLabelMap[item.sourceType] || item.sourceType,
      item.fileName || "手动录入",
      new Date(item.createdAt).toLocaleString("zh-CN"),
      `${item.successRows}/${item.totalRows}`,
      renderStatus(item.status),
    ]);
  }, [imports]);

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
              <InlineStack gap="300">
                <Button variant="primary" onClick={openManualModal}>
                  手动录入
                </Button>
                <Button onClick={openExcelModal}>
                  Excel 导入
                </Button>
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
          <Card title="导入记录">
            <DataTable
              columnContentTypes={["text", "text", "text", "text", "text", "text"]}
              headings={["类型", "来源", "文件", "时间", "完成情况", "状态"]}
              rows={tableRows}
              emptyState="暂无导入记录"
            />
          </Card>
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
