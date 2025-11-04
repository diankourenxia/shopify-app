#!/usr/bin/env node

/**
 * 检查数据库状态和 note 字段
 */

import { PrismaClient } from '@prisma/client';

async function diagnose() {
  const prisma = new PrismaClient();
  
  console.log('========================================');
  console.log('数据库诊断工具');
  console.log('========================================\n');
  
  try {
    // 检查表结构
    console.log('📋 检查 OrderStatus 表结构...\n');
    const tableInfo = await prisma.$queryRawUnsafe('PRAGMA table_info(OrderStatus);');
    
    console.log('列名\t\t类型\t\t可空\t\t默认值');
    console.log('─'.repeat(60));
    tableInfo.forEach(col => {
      const nullable = col.notnull ? 'NOT NULL' : 'NULL';
      const defaultVal = col.dflt_value || '-';
      console.log(`${col.name}\t\t${col.type}\t\t${nullable}\t\t${defaultVal}`);
    });
    console.log();
    
    // 检查 note 字段
    const hasNoteField = tableInfo.some(col => col.name === 'note');
    
    if (hasNoteField) {
      console.log('✅ note 字段存在\n');
      
      // 检查数据
      console.log('📊 数据统计:');
      const total = await prisma.orderStatus.count();
      const withNote = await prisma.$queryRawUnsafe('SELECT COUNT(*) as count FROM OrderStatus WHERE note IS NOT NULL AND note != ""');
      
      console.log(`   总记录数: ${total}`);
      console.log(`   有备注的记录: ${withNote[0].count}\n`);
      
      // 显示最近的记录
      console.log('📝 最近 5 条记录:');
      const recent = await prisma.orderStatus.findMany({
        take: 5,
        orderBy: { updatedAt: 'desc' }
      });
      
      recent.forEach(record => {
        console.log(`   ID: ${record.id}`);
        console.log(`   OrderID: ${record.orderId}`);
        console.log(`   LineItemID: ${record.lineItemId || '(null)'}`);
        console.log(`   Status: ${record.status}`);
        console.log(`   Note: ${record.note || '(empty)'}`);
        console.log(`   Updated: ${record.updatedAt}`);
        console.log();
      });
      
    } else {
      console.log('❌ note 字段不存在！\n');
      console.log('⚠️  需要运行迁移脚本:');
      console.log('   node scripts/migrate-add-note-node.js\n');
    }
    
    await prisma.$disconnect();
    
    console.log('========================================');
    console.log('诊断完成');
    console.log('========================================\n');
    
  } catch (error) {
    console.error('❌ 诊断失败:', error.message);
    console.error('\n错误详情:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

diagnose();
