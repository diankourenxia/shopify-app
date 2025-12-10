#!/bin/bash
# 添加费用字段迁移脚本（加工费、布料费、产品费）

echo "============================="
echo "添加费用字段迁移"
echo "============================="

# 检查是否在正确目录
if [ ! -f "prisma/schema.prisma" ]; then
    echo "错误: 请在项目根目录运行此脚本"
    exit 1
fi

# 使用 Node.js 执行迁移
node -e "
const { PrismaClient } = require('@prisma/client');

async function migrate() {
  const prisma = new PrismaClient();
  
  try {
    // 获取表结构
    const tableInfo = await prisma.\$queryRaw\`PRAGMA table_info(OrderStatus)\`;
    const columns = tableInfo.map(col => col.name);
    
    // 检查并添加 processingFee 列（加工费 - 罗马帘）
    if (!columns.includes('processingFee')) {
      console.log('添加 processingFee 字段（加工费）...');
      await prisma.\$executeRaw\`ALTER TABLE OrderStatus ADD COLUMN processingFee REAL\`;
      console.log('✅ processingFee 字段添加成功');
    } else {
      console.log('✅ processingFee 字段已存在，跳过');
    }
    
    // 检查并添加 fabricFee 列（布料费 - 罗马帘）
    if (!columns.includes('fabricFee')) {
      console.log('添加 fabricFee 字段（布料费）...');
      await prisma.\$executeRaw\`ALTER TABLE OrderStatus ADD COLUMN fabricFee REAL\`;
      console.log('✅ fabricFee 字段添加成功');
    } else {
      console.log('✅ fabricFee 字段已存在，跳过');
    }
    
    // 检查并添加 productFee 列（产品费 - 罗马杆/轨道）
    if (!columns.includes('productFee')) {
      console.log('添加 productFee 字段（产品费）...');
      await prisma.\$executeRaw\`ALTER TABLE OrderStatus ADD COLUMN productFee REAL\`;
      console.log('✅ productFee 字段添加成功');
    } else {
      console.log('✅ productFee 字段已存在，跳过');
    }
    
    console.log('\\n迁移完成！');
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  } finally {
    await prisma.\$disconnect();
  }
}

migrate();
"

echo ""
echo "迁移脚本执行完成"
