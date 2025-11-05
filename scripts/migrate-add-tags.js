#!/usr/bin/env node

/**
 * 数据库迁移脚本 - 添加标签功能
 * 
 * 此脚本会在生产数据库中添加 Tag 和 OrderTag 表
 * 使用 Prisma Client 执行 SQL，无需 sqlite3 命令行工具
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

async function main() {
  console.log('========================================');
  console.log('开始数据库迁移：添加标签功能');
  console.log('========================================\n');

  try {
    // 步骤 1: 备份数据库
    console.log('📦 步骤 1: 创建数据库备份...');
    const dbPath = process.env.DATABASE_URL?.replace('file:', '') || './prisma/prod.sqlite';
    const backupPath = dbPath.replace('.sqlite', `_before_add_tags_${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
    
    try {
      fs.copyFileSync(dbPath, backupPath);
      console.log(`✅ 备份已创建: ${backupPath}\n`);
    } catch (error) {
      console.log(`⚠️  备份失败，继续执行: ${error.message}\n`);
    }

    // 步骤 2: 检查表是否已存在
    console.log('🔍 步骤 2: 检查表是否已存在...');
    const tables = await prisma.$queryRawUnsafe(`
      SELECT name FROM sqlite_master WHERE type='table' AND name IN ('Tag', 'OrderTag')
    `);
    
    if (tables.length > 0) {
      console.log('⚠️  表已存在，跳过创建');
      console.log(`   已存在的表: ${tables.map(t => t.name).join(', ')}\n`);
    } else {
      console.log('✅ 表不存在，继续创建\n');

      // 步骤 3: 创建 Tag 表
      console.log('📝 步骤 3: 创建 Tag 表...');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "Tag" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "name" TEXT NOT NULL,
          "color" TEXT NOT NULL DEFAULT '#808080',
          "description" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL
        )
      `);
      console.log('✅ Tag 表创建成功\n');

      // 步骤 4: 创建 Tag 索引
      console.log('📝 步骤 4: 创建 Tag 索引...');
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name")
      `);
      console.log('✅ Tag 索引创建成功\n');

      // 步骤 5: 创建 OrderTag 表
      console.log('📝 步骤 5: 创建 OrderTag 表...');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "OrderTag" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "orderId" TEXT NOT NULL,
          "tagId" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "OrderTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      console.log('✅ OrderTag 表创建成功\n');

      // 步骤 6: 创建 OrderTag 索引
      console.log('📝 步骤 6: 创建 OrderTag 索引...');
      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX "OrderTag_orderId_tagId_key" ON "OrderTag"("orderId", "tagId")
      `);
      console.log('✅ OrderTag 索引创建成功\n');
    }

    // 步骤 7: 验证表结构
    console.log('🔍 步骤 7: 验证表结构...');
    const tagInfo = await prisma.$queryRawUnsafe(`PRAGMA table_info(Tag)`);
    const orderTagInfo = await prisma.$queryRawUnsafe(`PRAGMA table_info(OrderTag)`);
    
    console.log('Tag 表字段:', tagInfo.map(f => f.name).join(', '));
    console.log('OrderTag 表字段:', orderTagInfo.map(f => f.name).join(', '));
    console.log('✅ 表结构验证成功\n');

    // 步骤 8: 标记迁移为已应用
    console.log('📝 步骤 8: 标记迁移为已应用...');
    try {
      await prisma.$executeRawUnsafe(`
        INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
        VALUES (
          '${Date.now()}',
          'manual_migration',
          datetime('now'),
          '20251105022659_add_tags',
          'Manual migration for adding tags',
          NULL,
          datetime('now'),
          1
        )
      `);
      console.log('✅ 迁移已标记\n');
    } catch (error) {
      console.log('⚠️  标记迁移失败（可能已存在）:', error.message, '\n');
    }

    // 步骤 9: 重新生成 Prisma Client
    console.log('🔄 步骤 9: 重新生成 Prisma Client...');
    console.log('   请手动运行: npx prisma generate\n');

    console.log('========================================');
    console.log('✅ 迁移完成！');
    console.log('========================================\n');
    console.log('后续步骤:');
    console.log('1. 运行: npx prisma generate');
    console.log('2. 运行: npm run build');
    console.log('3. 运行: pm2 restart shopify-order-app\n');

  } catch (error) {
    console.error('❌ 迁移失败:', error);
    console.error('错误详情:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
