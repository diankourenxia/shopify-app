import { useMemo, useState, useEffect } from "react";
import { json } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Select,
  TextField,
  Button,
  DataTable,
  Badge,
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
  const [manualOrderType, setManualOrderType] = useState("DRAPERY");
  const [manualFormValues, setManualFormValues] = useState({});

  useEffect(() => {
    if (manualFetcher.state === "idle" && manualFetcher.data?.success) {
      setManualFormValues({});
    }
  }, [manualFetcher.state, manualFetcher.data]);

  const handleManualChange = (name) => (value) => {
    setManualFormValues((prev) => ({ ...prev, [name]: value }));
  };
  const manualValue = (name) => manualFormValues[name] ?? "";

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

  return (
    <Page title="订单导入中心" subtitle="支持布帘/罗马帘/轨道/罗马杆的手动录入与Excel导入">
      <Layout>
        <Layout.Section variant="oneThird">
          <Card title="手动录入" sectioned>
            <manualFetcher.Form method="post">
              <input type="hidden" name="intent" value="manual-import" />
              <BlockStack gap="400">
                <Select
                  label="订单类型"
                  options={ORDER_TYPE_OPTIONS}
                  value={manualOrderType}
                  onChange={setManualOrderType}
                  name="orderType"
                />
                <TextField
                  label="订单编号"
                  name="orderNumber"
                  autoComplete="off"
                  value={manualValue("orderNumber")}
                  onChange={handleManualChange("orderNumber")}
                  required
                />
                {renderManualFields(manualOrderType, manualValue, handleManualChange)}
                <Button submit loading={manualFetcher.state !== "idle"} variant="primary">
                  保存
                </Button>
                {manualFetcher.data?.error && (
                  <Text tone="critical">{manualFetcher.data.error}</Text>
                )}
                {manualFetcher.data?.success && (
                  <Text tone="success">{manualFetcher.data.message}</Text>
                )}
              </BlockStack>
            </manualFetcher.Form>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card title="Excel 导入" sectioned>
            <excelFetcher.Form method="post" encType="multipart/form-data">
              <input type="hidden" name="intent" value="excel-import" />
              <BlockStack gap="400">
                <label>
                  <Text variant="bodyMd" fontWeight="semibold">
                    上传Excel文件
                  </Text>
                  <input type="file" name="importFile" accept=".xlsx,.xls" style={{ marginTop: 8 }} />
                </label>
                <Text variant="bodySm" tone="subdued">
                  支持按模板上传四种类型的订单，系统将按工作表自动识别。
                </Text>
                <Button submit loading={excelFetcher.state !== "idle"} variant="primary">
                  上传并导入
                </Button>
                {excelFetcher.data?.error && (
                  <Text tone="critical">{excelFetcher.data.error}</Text>
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
            </excelFetcher.Form>
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
    </Page>
  );
}

function renderManualFields(orderType, valueGetter, changeGetter) {
  switch (orderType) {
    case "DRAPERY":
      return (
        <BlockStack gap="200">
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
          <InlineStack gap="200">
            <TextField
              label="成品高度(cm)"
              name="finishedHeight"
              type="number"
              autoComplete="off"
              value={valueGetter("finishedHeight")}
              onChange={changeGetter("finishedHeight")}
            />
            <TextField
              label="墙宽(cm)"
              name="wallWidth"
              type="number"
              autoComplete="off"
              value={valueGetter("wallWidth")}
              onChange={changeGetter("wallWidth")}
            />
          </InlineStack>
          <InlineStack gap="200">
            <TextField
              label="每片用料"
              name="fabricPerPanel"
              type="number"
              autoComplete="off"
              value={valueGetter("fabricPerPanel")}
              onChange={changeGetter("fabricPerPanel")}
            />
            <TextField
              label="分片"
              name="panelCount"
              type="number"
              autoComplete="off"
              value={valueGetter("panelCount")}
              onChange={changeGetter("panelCount")}
            />
          </InlineStack>
          <InlineStack gap="200">
            <TextField
              label="倍数"
              name="fullnessRatio"
              type="number"
              autoComplete="off"
              value={valueGetter("fullnessRatio")}
              onChange={changeGetter("fullnessRatio")}
            />
            <TextField
              label="窗户数量"
              name="windowCount"
              type="number"
              autoComplete="off"
              value={valueGetter("windowCount")}
              onChange={changeGetter("windowCount")}
            />
          </InlineStack>
          <InlineStack gap="200">
            <TextField
              label="是否定型 (是/否)"
              name="isHeatSet"
              autoComplete="off"
              value={valueGetter("isHeatSet")}
              onChange={changeGetter("isHeatSet")}
            />
            <TextField
              label="衬布"
              name="lining"
              autoComplete="off"
              value={valueGetter("lining")}
              onChange={changeGetter("lining")}
            />
            <TextField
              label="绑带"
              name="tieback"
              autoComplete="off"
              value={valueGetter("tieback")}
              onChange={changeGetter("tieback")}
            />
          </InlineStack>
        </BlockStack>
      );
    case "ROMAN_SHADE":
      return (
        <BlockStack gap="200">
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
          <InlineStack gap="200">
            <TextField
              label="窗户宽度(cm)"
              name="windowWidth"
              type="number"
              autoComplete="off"
              value={valueGetter("windowWidth")}
              onChange={changeGetter("windowWidth")}
            />
            <TextField
              label="窗户高度(cm)"
              name="windowHeight"
              type="number"
              autoComplete="off"
              value={valueGetter("windowHeight")}
              onChange={changeGetter("windowHeight")}
            />
          </InlineStack>
          <InlineStack gap="200">
            <TextField
              label="窗帘数量"
              name="curtainCount"
              type="number"
              autoComplete="off"
              value={valueGetter("curtainCount")}
              onChange={changeGetter("curtainCount")}
            />
            <TextField
              label="房间号"
              name="roomNumber"
              autoComplete="off"
              value={valueGetter("roomNumber")}
              onChange={changeGetter("roomNumber")}
            />
          </InlineStack>
          <InlineStack gap="200">
            <TextField
              label="衬布"
              name="lining"
              autoComplete="off"
              value={valueGetter("lining")}
              onChange={changeGetter("lining")}
            />
            <TextField
              label="包边"
              name="edging"
              autoComplete="off"
              value={valueGetter("edging")}
              onChange={changeGetter("edging")}
            />
          </InlineStack>
          <InlineStack gap="200">
            <TextField
              label="控制方式"
              name="controlType"
              autoComplete="off"
              value={valueGetter("controlType")}
              onChange={changeGetter("controlType")}
            />
            <TextField
              label="安装方式"
              name="mountingType"
              autoComplete="off"
              value={valueGetter("mountingType")}
              onChange={changeGetter("mountingType")}
            />
            <TextField
              label="打孔/免打孔"
              name="grommetOption"
              autoComplete="off"
              value={valueGetter("grommetOption")}
              onChange={changeGetter("grommetOption")}
            />
          </InlineStack>
        </BlockStack>
      );
    case "TRACK":
      return (
        <BlockStack gap="200">
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
          <TextField
            label="单开/双开"
            name="openingType"
            autoComplete="off"
            value={valueGetter("openingType")}
            onChange={changeGetter("openingType")}
          />
        </BlockStack>
      );
    case "ROMAN_ROD":
      return (
        <BlockStack gap="200">
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
          <TextField
            label="是否要静音环"
            name="needSilentRing"
            autoComplete="off"
            value={valueGetter("needSilentRing")}
            onChange={changeGetter("needSilentRing")}
          />
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
  return <Badge tone={toneMap[status] || "info"}>{status}</Badge>;
}
