import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

// 确保数据目录存在
async function ensureDataDir() {
  const dataDir = path.dirname(USERS_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// 初始化默认用户
async function initializeDefaultUsers() {
  try {
    await fs.access(USERS_FILE);
  } catch {
    await ensureDataDir();
    const defaultUsers = [
      {
        id: 'admin',
        username: 'admin',
        password: await bcrypt.hash('admin123', 10),
        role: 'admin',
        createdAt: new Date().toISOString()
      },
      {
        id: 'viewer',
        username: 'viewer',
        password: await bcrypt.hash('viewer123', 10),
        role: 'viewer',
        createdAt: new Date().toISOString()
      }
    ];
    await fs.writeFile(USERS_FILE, JSON.stringify(defaultUsers, null, 2));
    console.log('默认用户已创建:');
    console.log('管理员: admin / admin123');
    console.log('查看者: viewer / viewer123');
  }
}

// 获取所有用户
async function getUsers() {
  await initializeDefaultUsers();
  const data = await fs.readFile(USERS_FILE, 'utf-8');
  return JSON.parse(data);
}

// 根据用户名查找用户
export async function findUserByUsername(username) {
  const users = await getUsers();
  return users.find(user => user.username === username);
}

// 验证用户密码
export async function verifyPassword(username, password) {
  const user = await findUserByUsername(username);
  if (!user) {
    return null;
  }
  
  const isValid = await bcrypt.compare(password, user.password);
  return isValid ? user : null;
}

// 创建新用户
export async function createUser(username, password, role = 'viewer') {
  const users = await getUsers();
  
  // 检查用户是否已存在
  if (users.find(user => user.username === username)) {
    throw new Error('用户名已存在');
  }
  
  const newUser = {
    id: Date.now().toString(),
    username,
    password: await bcrypt.hash(password, 10),
    role,
    createdAt: new Date().toISOString()
  };
  
  users.push(newUser);
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
  
  return { ...newUser, password: undefined }; // 不返回密码
}

// 更新用户
export async function updateUser(userId, updates) {
  const users = await getUsers();
  const userIndex = users.findIndex(user => user.id === userId);
  
  if (userIndex === -1) {
    throw new Error('用户不存在');
  }
  
  const updatedUser = { ...users[userIndex], ...updates };
  if (updates.password) {
    updatedUser.password = await bcrypt.hash(updates.password, 10);
  }
  
  users[userIndex] = updatedUser;
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
  
  return { ...updatedUser, password: undefined };
}

// 删除用户
export async function deleteUser(userId) {
  const users = await getUsers();
  const filteredUsers = users.filter(user => user.id !== userId);
  
  if (filteredUsers.length === users.length) {
    throw new Error('用户不存在');
  }
  
  await fs.writeFile(USERS_FILE, JSON.stringify(filteredUsers, null, 2));
  return true;
}
