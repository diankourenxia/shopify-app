import { json } from "@remix-run/node";
import { 
  createUser, 
  updateUser, 
  deleteUser 
} from "../services/auth.server";
import fs from 'fs/promises';
import path from 'path';

const USERS_FILE = path.join(process.cwd(), 'data', 'users.json');

// 获取所有用户（不返回密码）
async function getAllUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, 'utf-8');
    const users = JSON.parse(data);
    return users.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      createdAt: user.createdAt
    }));
  } catch (error) {
    return [];
  }
}

// GET 请求 - 获取用户列表
export const loader = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const sessionParam = url.searchParams.get("session");
    
    // 验证会话
    let userSession = null;
    if (sessionParam) {
      try {
        userSession = JSON.parse(decodeURIComponent(sessionParam));
      } catch (error) {
        return json({ success: false, error: "无效的会话" }, { status: 401 });
      }
    }
    
    // 检查是否为管理员
    if (!userSession || userSession.role !== 'admin') {
      return json({ success: false, error: "无权限访问" }, { status: 403 });
    }
    
    const users = await getAllUsers();
    return json({ success: true, data: users });
  } catch (error) {
    console.error("获取用户列表失败:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
};

// POST 请求 - 创建/更新/删除用户
export const action = async ({ request }) => {
  try {
    const formData = await request.formData();
    const action = formData.get("action");
    const sessionParam = formData.get("session");
    
    // 验证会话
    let userSession = null;
    if (sessionParam) {
      try {
        userSession = JSON.parse(decodeURIComponent(sessionParam));
      } catch (error) {
        return json({ success: false, error: "无效的会话" }, { status: 401 });
      }
    }
    
    // 检查是否为管理员
    if (!userSession || userSession.role !== 'admin') {
      return json({ success: false, error: "无权限操作" }, { status: 403 });
    }
    
    if (action === "create") {
      const username = formData.get("username");
      const password = formData.get("password");
      const role = formData.get("role") || "viewer";
      
      if (!username || !password) {
        return json({ success: false, error: "用户名和密码不能为空" }, { status: 400 });
      }
      
      if (password.length < 6) {
        return json({ success: false, error: "密码长度至少6位" }, { status: 400 });
      }
      
      const user = await createUser(username, password, role);
      return json({ success: true, data: user, message: "用户创建成功" });
    }
    
    if (action === "update") {
      const userId = formData.get("userId");
      const username = formData.get("username");
      const password = formData.get("password");
      const role = formData.get("role");
      
      if (!userId) {
        return json({ success: false, error: "用户ID不能为空" }, { status: 400 });
      }
      
      const updates = {};
      if (username) updates.username = username;
      if (password && password.length >= 6) updates.password = password;
      if (role) updates.role = role;
      
      const user = await updateUser(userId, updates);
      return json({ success: true, data: user, message: "用户更新成功" });
    }
    
    if (action === "delete") {
      const userId = formData.get("userId");
      
      if (!userId) {
        return json({ success: false, error: "用户ID不能为空" }, { status: 400 });
      }
      
      // 防止删除自己
      if (userId === userSession.userId) {
        return json({ success: false, error: "不能删除自己" }, { status: 400 });
      }
      
      await deleteUser(userId);
      return json({ success: true, message: "用户删除成功" });
    }
    
    return json({ success: false, error: "未知操作" }, { status: 400 });
  } catch (error) {
    console.error("用户操作失败:", error);
    return json({ success: false, error: error.message }, { status: 500 });
  }
};
