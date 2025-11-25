/**
 * 顺丰快递API加密/解密工具
 * 基于 kx-print-master 项目的 BizMsgCrypt 实现
 */

import crypto from 'crypto';

/**
 * PKCS7填充
 */
function pkcs7Encode(data) {
  const blockSize = 32;
  const textLength = Buffer.byteLength(data);
  const amountToPad = blockSize - (textLength % blockSize);
  const pad = Buffer.alloc(amountToPad, amountToPad);
  return Buffer.concat([Buffer.from(data), pad]);
}

/**
 * 移除PKCS7填充
 */
function pkcs7Decode(data) {
  const pad = data[data.length - 1];
  if (pad < 1 || pad > 32) {
    throw new Error('Invalid padding');
  }
  return data.slice(0, -pad);
}

/**
 * 生成16字节随机字符串
 */
function getRandomStr() {
  return crypto.randomBytes(16).toString('base64').substring(0, 16);
}

/**
 * 顺丰API加密工具类
 */
export class SfEncryptor {
  constructor(token, encodingAesKey, appKey) {
    this.token = token;
    this.appKey = appKey;
    // encodingAesKey 应该是43位长度的Base64编码字符串
    // 解码后得到32字节的密钥
    this.aesKey = Buffer.from(encodingAesKey + '=', 'base64');
    
    if (this.aesKey.length !== 32) {
      throw new Error('Invalid encodingAesKey length, must be 32 bytes after decode');
    }
  }

  /**
   * 加密消息
   * @param {string} text - 要加密的文本
   * @param {string} timestamp - 时间戳
   * @param {string} nonce - 随机数
   * @returns {object} - 包含加密数据和签名的对象
   */
  encrypt(text, timestamp, nonce) {
    try {
      // 1. 获取16位随机字符串
      const randomStr = getRandomStr();
      
      // 2. 构造待加密的数据
      // 格式: 随机16字节 + 网络字节序的消息长度(4字节) + 消息内容 + appKey
      const textBuffer = Buffer.from(text);
      const textLengthBuffer = Buffer.alloc(4);
      textLengthBuffer.writeUInt32BE(textBuffer.length, 0);
      
      const msg = Buffer.concat([
        Buffer.from(randomStr),
        textLengthBuffer,
        textBuffer,
        Buffer.from(this.appKey)
      ]);
      
      // 3. PKCS7填充
      const paddedMsg = pkcs7Encode(msg);
      
      // 4. AES-256-CBC加密
      const iv = this.aesKey.slice(0, 16);
      const cipher = crypto.createCipheriv('aes-256-cbc', this.aesKey, iv);
      cipher.setAutoPadding(false);
      
      let encrypted = cipher.update(paddedMsg);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      
      // 5. Base64编码
      const encryptedBase64 = encrypted.toString('base64');
      
      // 6. 计算签名
      const signature = this.generateSignature(this.token, timestamp, nonce, encryptedBase64);
      
      return {
        encrypt: encryptedBase64,
        signature: signature,
        timestamp: timestamp,
        nonce: nonce
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw error;
    }
  }

  /**
   * 解密消息
   * @param {string} encryptedBase64 - Base64编码的加密数据
   * @returns {string} - 解密后的文本
   */
  decrypt(encryptedBase64) {
    try {
      // 1. Base64解码
      const encrypted = Buffer.from(encryptedBase64, 'base64');
      
      // 2. AES-256-CBC解密
      const iv = this.aesKey.slice(0, 16);
      const decipher = crypto.createDecipheriv('aes-256-cbc', this.aesKey, iv);
      decipher.setAutoPadding(false);
      
      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      
      // 3. 移除PKCS7填充
      const unpaddedMsg = pkcs7Decode(decrypted);
      
      // 4. 解析数据
      // 跳过前16字节的随机字符串
      const textLength = unpaddedMsg.readUInt32BE(16);
      const textStart = 20;
      const textEnd = textStart + textLength;
      
      // 提取消息内容
      const text = unpaddedMsg.slice(textStart, textEnd).toString('utf8');
      
      // 验证appKey（可选）
      const appKeyStart = textEnd;
      const receivedAppKey = unpaddedMsg.slice(appKeyStart).toString('utf8');
      
      if (receivedAppKey !== this.appKey) {
        console.warn('AppKey mismatch in decrypted message');
      }
      
      return text;
    } catch (error) {
      console.error('Decryption error:', error);
      throw error;
    }
  }

  /**
   * 生成签名
   * 使用SHA1对 token、timestamp、nonce、encrypt 排序后的字符串进行散列
   */
  generateSignature(token, timestamp, nonce, encrypt) {
    const arr = [token, timestamp, nonce, encrypt].sort();
    const str = arr.join('');
    
    const sha1 = crypto.createHash('sha1');
    sha1.update(str);
    return sha1.digest('hex');
  }

  /**
   * 验证签名
   */
  verifySignature(signature, timestamp, nonce, encrypt) {
    const expectedSignature = this.generateSignature(this.token, timestamp, nonce, encrypt);
    return signature === expectedSignature;
  }
}

/**
 * 辅助函数：创建加密器实例
 */
export function createSfEncryptor(token, encodingAesKey, appKey) {
  return new SfEncryptor(token, encodingAesKey, appKey);
}

export default SfEncryptor;
