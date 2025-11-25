#!/bin/bash

# 顺丰打印功能 - 快速测试脚本

echo "====================================="
echo "顺丰快递打印功能测试"
echo "====================================="
echo ""

# 检查环境变量配置
echo "步骤 1: 检查环境变量配置..."
echo ""

if [ -z "$SF_APP_KEY" ]; then
    echo "❌ 错误: SF_APP_KEY 未配置"
    echo "请先配置环境变量，参考 .env.sf-express.example"
    exit 1
fi

if [ -z "$SF_APP_SECRET" ]; then
    echo "❌ 错误: SF_APP_SECRET 未配置"
    exit 1
fi

if [ -z "$SF_ENCODING_AES_KEY" ]; then
    echo "❌ 错误: SF_ENCODING_AES_KEY 未配置"
    exit 1
fi

echo "✅ 环境变量配置正常"
echo ""

# 测试API连接
echo "步骤 2: 测试顺丰API连接..."
echo ""

# 获取应用URL（开发环境）
APP_URL=${APP_URL:-"http://localhost:3000"}

# 测试连接
RESPONSE=$(curl -s -X POST "${APP_URL}/api/sf-express" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "action=testConnection")

if echo "$RESPONSE" | grep -q "success.*true"; then
    echo "✅ 顺丰API连接成功"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    echo "❌ 顺丰API连接失败"
    echo "$RESPONSE"
    exit 1
fi

echo ""
echo "====================================="
echo "测试完成！"
echo "====================================="
echo ""
echo "下一步："
echo "1. 访问订单详情页测试创建运单"
echo "2. 点击'创建运单并打印'按钮"
echo "3. 查看运单号和打印结果"
echo ""
