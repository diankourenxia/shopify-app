#!/bin/bash

# 顺丰打印功能 - 简化版测试脚本

echo "====================================="
echo "顺丰快递打印功能测试"
echo "====================================="
echo ""

# 检查环境变量配置
echo "步骤 1: 检查发件人信息配置..."
echo ""

if [ -z "$SF_SENDER_CONTACT" ]; then
    echo "⚠️  警告: SF_SENDER_CONTACT 未配置，将使用默认值"
fi

if [ -z "$SF_SENDER_PHONE" ]; then
    echo "⚠️  警告: SF_SENDER_PHONE 未配置，将使用默认值"
fi

if [ -z "$SF_SENDER_ADDRESS" ]; then
    echo "⚠️  警告: SF_SENDER_ADDRESS 未配置，将使用默认值"
fi

echo ""

# 检查API服务
echo "步骤 2: 检查顺丰API服务..."
echo ""

API_URL=${SF_API_BASE_URL:-"http://8.219.107.56"}
echo "API地址: $API_URL"

# 测试创建运单接口
echo "测试创建运单接口..."
CREATE_URL="$API_URL/sf/create_order"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$CREATE_URL" -X POST -H "Content-Type: application/json" -d '{}' --connect-timeout 5)

if [ "$HTTP_CODE" == "000" ]; then
    echo "❌ 无法连接到API服务，请检查服务是否在线"
    exit 1
elif [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "400" ]; then
    echo "✅ API服务连接正常 (HTTP $HTTP_CODE)"
else
    echo "⚠️  API返回状态码: $HTTP_CODE"
fi

echo ""

# 测试打印接口
echo "测试打印运单接口..."
PRINT_URL="$API_URL/sf/print_order"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$PRINT_URL" -X POST -H "Content-Type: application/json" -d '{}' --connect-timeout 5)

if [ "$HTTP_CODE" == "000" ]; then
    echo "❌ 无法连接到打印接口"
    exit 1
elif [ "$HTTP_CODE" == "200" ] || [ "$HTTP_CODE" == "400" ]; then
    echo "✅ 打印接口连接正常 (HTTP $HTTP_CODE)"
else
    echo "⚠️  打印接口返回状态码: $HTTP_CODE"
fi

echo ""
echo "====================================="
echo "测试完成！"
echo "====================================="
echo ""
echo "下一步："
echo "1. 确保配置了发件人信息"
echo "2. 访问订单详情页测试创建运单"
echo "3. 点击'创建运单并打印'按钮"
echo "4. 查看运单号和打印URL"
echo ""
