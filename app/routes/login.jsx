import { redirect } from "@remix-run/node";
import { Form, useLoaderData, useActionData } from "@remix-run/react";
import { verifyPassword } from "../services/auth.server";
import styles from "./_index/styles.module.css";

export const loader = async ({ request }) => {
  const url = new URL(request.url);
  const redirectTo = url.searchParams.get("redirectTo") || "/orders/public";
  
  return { redirectTo };
};

export const action = async ({ request }) => {
  const formData = await request.formData();
  const username = formData.get("username");
  const password = formData.get("password");
  const redirectTo = formData.get("redirectTo");

  if (!username || !password) {
    return { error: "请输入用户名和密码" };
  }

  try {
    const user = await verifyPassword(username, password);
    if (!user) {
      return { error: "用户名或密码错误" };
    }

    // 创建会话
    const session = {
      userId: user.id,
      username: user.username,
      role: user.role,
      loginTime: new Date().toISOString()
    };

    // 重定向到目标页面，并在URL中传递用户信息（简单实现）
    const sessionData = encodeURIComponent(JSON.stringify(session));
    throw redirect(`${redirectTo}?session=${sessionData}`);
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    return { error: "登录失败，请稍后重试" };
  }
};

export default function Login() {
  const { redirectTo } = useLoaderData();
  const actionData = useActionData();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <div className={styles.loginSection}>
          <h1 className={styles.heading}>登录访问</h1>
          <p className={styles.text}>
            请输入您的用户名和密码来访问订单数据
          </p>

          {actionData?.error && (
            <div className={styles.errorMessage}>
              {actionData.error}
            </div>
          )}

          <Form method="post" className={styles.loginForm}>
            <input type="hidden" name="redirectTo" value={redirectTo} />
            
            <div className={styles.formGroup}>
              <label htmlFor="username" className={styles.label}>
                用户名
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                className={styles.input}
                placeholder="请输入用户名"
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="password" className={styles.label}>
                密码
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className={styles.input}
                placeholder="请输入密码"
              />
            </div>

            <button type="submit" className={styles.loginButton}>
              登录
            </button>
          </Form>

          <div className={styles.loginInfo}>
            <h3>默认账户</h3>
            <div className={styles.accountInfo}>
              <div className={styles.accountItem}>
                <strong>管理员账户:</strong> admin / admin123
              </div>
              <div className={styles.accountItem}>
                <strong>查看者账户:</strong> viewer / viewer123
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
