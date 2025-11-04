#!/usr/bin/env node

/**
 * 添加 note 字段到 OrderStatus 表的 Node.js 迁移脚本
 * 不依赖 sqlite3 命令行工具
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('==========================================');
console.log('添加 note 字段到 OrderStatus 表');
console.log('==========================================\n');

const DB_PATH = process.env.DATABASE_URL?.replace('file:', '') || './prisma/prod.sqlite';
const BACKUP_DIR = './backups';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

async function main() {
  try {
    // 步骤 1: 备份数据库
    console.log('📦 步骤 1: 备份数据库...');
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    const backupFile = path.join(BACKUP_DIR, `prod_before_add_note_${TIMESTAMP}.sqlite`);
    
    if (fs.existsSync(DB_PATH)) {
      fs.copyFileSync(DB_PATH, backupFile);
      console.log(`✅ 数据库已备份到: ${backupFile}\n`);
    } else {
      console.log(`⚠️  数据库文件不存在: ${DB_PATH}`);
      console.log('   将创建新数据库\n');
    }

    // 步骤 2: 使用 Prisma 执行原始 SQL
    console.log('🔧 步骤 2: 添加 note 字段...');
    
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient.PrismaClient();
    
    try {
      // 检查字段是否已存在
      console.log('   检查 note 字段是否已存在...');
      const tableInfo = await prisma.$queryRawUnsafe('PRAGMA table_info(OrderStatus);');
      
      const hasNoteField = tableInfo.some(col => col.name === 'note');
      
      if (hasNoteField) {
        console.log('✅ note 字段已存在，无需迁移\n');
        
        console.log('📋 当前表结构:');
        tableInfo.forEach(col => {
          console.log(`   ${col.cid} | ${col.name} | ${col.type} | ${col.notnull ? 'NOT NULL' : 'NULL'} | ${col.dflt_value || ''} | ${col.pk}`);
        });
        
        await prisma.$disconnect();
        return;
      }
      
      // 添加 note 字段
      console.log('   执行 ALTER TABLE...');
      await prisma.$executeRawUnsafe('ALTER TABLE OrderStatus ADD COLUMN note TEXT;');
      console.log('✅ note 字段添加成功\n');
      
      // 步骤 3: 验证迁移
      console.log('🔍 步骤 3: 验证迁移结果...');
      const newTableInfo = await prisma.$queryRawUnsafe('PRAGMA table_info(OrderStatus);');
      
      console.log('新的表结构:');
      newTableInfo.forEach(col => {
        console.log(`   ${col.cid} | ${col.name} | ${col.type} | ${col.notnull ? 'NOT NULL' : 'NULL'} | ${col.dflt_value || ''} | ${col.pk}`);
      });
      console.log();
      
      const hasNewNoteField = newTableInfo.some(col => col.name === 'note');
      if (!hasNewNoteField) {
        throw new Error('验证失败: note 字段未添加成功');
      }
      
      await prisma.$disconnect();
      
    } catch (error) {
      await prisma.$disconnect();
      throw error;
    }
    
    // 步骤 4: 标记 Prisma 迁移为已应用
    console.log('📝 步骤 4: 标记 Prisma 迁移为已应用...');
    try {
      execSync('npx prisma migrate resolve --applied 20251104064456_add_note_to_order_status', {
        stdio: 'inherit'
      });
      console.log('✅ 迁移已标记为已应用\n');
    } catch (error) {
      console.log('⚠️  标记迁移失败，但字段已添加。可以手动运行：');
      console.log('   npx prisma migrate resolve --applied 20251104064456_add_note_to_order_status\n');
    }
    
    // 步骤 5: 重新生成 Prisma Client
    console.log('🔄 步骤 5: 重新生成 Prisma Client...');
    try {
      execSync('npx prisma generate', { stdio: 'inherit' });
      console.log('✅ Prisma Client 已重新生成\n');
    } catch (error) {
      console.log('⚠️  生成 Prisma Client 失败\n');
    }
    
    console.log('==========================================');
    console.log('✅ 迁移完成！');
    console.log('==========================================\n');
    console.log(`备份位置: ${backupFile}\n`);
    console.log('下一步: 重新构建并重启应用');
    console.log('  npm run build');
    console.log('  pm2 restart shopify-order-app\n');
    
  } catch (error) {
    console.error('\n❌ 迁移失败:', error.message);
    console.error('\n如果需要回滚，请恢复备份:');
    console.error(`  cp ${path.join(BACKUP_DIR, `prod_before_add_note_${TIMESTAMP}.sqlite`)} ${DB_PATH}`);
    console.error('  pm2 restart shopify-order-app\n');
    process.exit(1);
  }
}

main();
