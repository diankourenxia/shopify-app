#!/bin/bash
# 添加费用字段和小样发货字段迁移脚本

echo "============================="
echo "数据库字段迁移"
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
    
    // 检查并添加小样发货相关字段
    if (!columns.includes('sampleShippingNo')) {
      console.log('添加 sampleShippingNo 字段（小样发货单号）...');
      await prisma.\$executeRaw\`ALTER TABLE OrderStatus ADD COLUMN sampleShippingNo TEXT\`;
      console.log('✅ sampleShippingNo 字段添加成功');
    } else {
      console.log('✅ sampleShippingNo 字段已存在，跳过');
    }
    
    if (!columns.includes('sampleShippingStatus')) {
      console.log('添加 sampleShippingStatus 字段（小样发货状态）...');
      await prisma.\$executeRaw\`ALTER TABLE OrderStatus ADD COLUMN sampleShippingStatus TEXT\`;
      console.log('✅ sampleShippingStatus 字段添加成功');
    } else {
      console.log('✅ sampleShippingStatus 字段已存在，跳过');
    }
    
    if (!columns.includes('sampleShippingCreatedAt')) {
      console.log('添加 sampleShippingCreatedAt 字段（小样发货创建时间）...');
      await prisma.\$executeRaw\`ALTER TABLE OrderStatus ADD COLUMN sampleShippingCreatedAt DATETIME\`;
      console.log('✅ sampleShippingCreatedAt 字段添加成功');
    } else {
      console.log('✅ sampleShippingCreatedAt 字段已存在，跳过');
    }
    
    if (!columns.includes('sampleTrackingNo')) {
      console.log('添加 sampleTrackingNo 字段（小样物流追踪号）...');
      await prisma.\$executeRaw\`ALTER TABLE OrderStatus ADD COLUMN sampleTrackingNo TEXT\`;
      console.log('✅ sampleTrackingNo 字段添加成功');
    } else {
      console.log('✅ sampleTrackingNo 字段已存在，跳过');
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
