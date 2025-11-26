#!/usr/bin/env node

/**
 * 添加白名单用户表的迁移脚本（Node.js版本）
 * 使用方法: node scripts/migrate-add-whitelist-node.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 数据库路径
const DB_PATH = '/var/www/shopify-app/prisma/prod.sqlite';

console.log('开始添加白名单用户表迁移...');
console.log(`数据库路径: ${DB_PATH}`);

// 创建表的 SQL
const createTableSQL = `
CREATE TABLE IF NOT EXISTS "WhitelistUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT
);
`;

// 创建唯一索引的 SQL
const createIndexSQL = `
CREATE UNIQUE INDEX IF NOT EXISTS "WhitelistUser_email_key" ON "WhitelistUser"("email");
`;

// 连接数据库并执行迁移
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ 连接数据库失败:', err.message);
    process.exit(1);
  }
  
  console.log('✅ 已连接到数据库');
  
  // 开始事务
  db.serialize(() => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.error('❌ 开始事务失败:', err.message);
        db.close();
        process.exit(1);
      }
    });
    
    // 创建表
    db.run(createTableSQL, (err) => {
      if (err) {
        console.error('❌ 创建表失败:', err.message);
        db.run('ROLLBACK');
        db.close();
        process.exit(1);
      }
      console.log('✅ WhitelistUser 表创建成功');
    });
    
    // 创建索引
    db.run(createIndexSQL, (err) => {
      if (err) {
        console.error('❌ 创建索引失败:', err.message);
        db.run('ROLLBACK');
        db.close();
        process.exit(1);
      }
      console.log('✅ 唯一索引创建成功');
    });
    
    // 提交事务
    db.run('COMMIT', (err) => {
      if (err) {
        console.error('❌ 提交事务失败:', err.message);
        db.run('ROLLBACK');
        db.close();
        process.exit(1);
      }
      
      console.log('\n✅ 迁移成功完成！\n');
      console.log('已创建 WhitelistUser 表，包含以下字段：');
      console.log('  - id: 主键');
      console.log('  - email: 邮箱地址（唯一）');
      console.log('  - name: 用户名称（可选）');
      console.log('  - description: 备注说明（可选）');
      console.log('  - isActive: 是否启用（默认 true）');
      console.log('  - createdAt: 创建时间');
      console.log('  - updatedAt: 更新时间');
      console.log('  - createdBy: 创建人（可选）');
      console.log('\n现在可以访问 /app/permissions 页面管理白名单用户了');
      
      // 关闭数据库
      db.close((err) => {
        if (err) {
          console.error('❌ 关闭数据库失败:', err.message);
        }
        process.exit(0);
      });
    });
  });
});
