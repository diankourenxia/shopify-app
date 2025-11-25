/**
 * 顺丰加密工具测试脚本
 * 用于验证加密/解密功能是否正常
 */

import { createSfEncryptor } from '../app/utils/sf-encryptor.js';

// 测试配置（使用示例值）
const TEST_CONFIG = {
  token: 'test_token_123456',
  appKey: 'test_app_key',
  // 43位Base64字符串（实际使用时替换为顺丰提供的密钥）
  encodingAesKey: 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG',
};

// 测试数据
const TEST_DATA = {
  customerCode: "TEST001",
  customerOrderNo: "ORDER20250101001",
  orderOperateType: "1",
};

console.log('===================================');
console.log('顺丰加密工具测试');
console.log('===================================\n');

try {
  // 创建加密器实例
  console.log('步骤 1: 创建加密器实例...');
  const encryptor = createSfEncryptor(
    TEST_CONFIG.token,
    TEST_CONFIG.encodingAesKey,
    TEST_CONFIG.appKey
  );
  console.log('✅ 加密器创建成功\n');

  // 测试加密
  console.log('步骤 2: 测试数据加密...');
  const timestamp = Date.now();
  const nonce = Math.floor(Math.random() * 1000000);
  const originalText = JSON.stringify(TEST_DATA);
  
  console.log('原始数据:', originalText);
  
  const encryptResult = encryptor.encrypt(
    originalText,
    timestamp.toString(),
    nonce.toString()
  );
  
  console.log('加密结果:');
  console.log('  - 加密数据长度:', encryptResult.encrypt.length);
  console.log('  - 签名:', encryptResult.signature.substring(0, 20) + '...');
  console.log('  - 时间戳:', encryptResult.timestamp);
  console.log('  - 随机数:', encryptResult.nonce);
  console.log('✅ 加密成功\n');

  // 测试解密
  console.log('步骤 3: 测试数据解密...');
  const decrypted = encryptor.decrypt(encryptResult.encrypt);
  console.log('解密数据:', decrypted);
  
  // 验证结果
  if (decrypted === originalText) {
    console.log('✅ 解密成功，数据一致\n');
  } else {
    console.log('❌ 解密失败，数据不一致\n');
    console.log('原始:', originalText);
    console.log('解密:', decrypted);
    process.exit(1);
  }

  // 测试签名验证
  console.log('步骤 4: 测试签名验证...');
  const isValid = encryptor.verifySignature(
    encryptResult.signature,
    encryptResult.timestamp,
    encryptResult.nonce,
    encryptResult.encrypt
  );
  
  if (isValid) {
    console.log('✅ 签名验证成功\n');
  } else {
    console.log('❌ 签名验证失败\n');
    process.exit(1);
  }

  console.log('===================================');
  console.log('所有测试通过！ ✅');
  console.log('===================================\n');
  console.log('加密工具可以正常使用');
  console.log('请确保配置正确的 encodingAesKey\n');

} catch (error) {
  console.error('❌ 测试失败:', error.message);
  console.error(error.stack);
  process.exit(1);
}
