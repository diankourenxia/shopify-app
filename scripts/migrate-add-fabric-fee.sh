#!/bin/bash
# 添加布料费字段迁移脚本

echo "============================="
echo "添加布料费字段迁移"
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
    // 检查 fabricFee 列是否存在
    const tableInfo = await prisma.\$queryRaw\`PRAGMA table_info(OrderStatus)\`;
    const hasFabricFee = tableInfo.some(col => col.name === 'fabricFee');
    
    if (!hasFabricFee) {
      console.log('添加 fabricFee 字段...');
      await prisma.\$executeRaw\`ALTER TABLE OrderStatus ADD COLUMN fabricFee REAL\`;
      console.log('✅ fabricFee 字段添加成功');
    } else {
      console.log('✅ fabricFee 字段已存在，跳过');
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
