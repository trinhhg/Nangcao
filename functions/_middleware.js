export async function onRequest(context) {
  const { request, next, env } = context;
  const PASSWORD = env.SITE_PASSWORD; 

  // 1. Kiểm tra Cookie
  const cookieHeader = request.headers.get("Cookie");
  const authCookie = `auth=${btoa(PASSWORD)}`; 
  
  if (cookieHeader && cookieHeader.includes(authCookie)) {
    return next();
  }

  // 2. Xử lý Đăng nhập
  if (request.method === "POST") {
    const formData = await request.formData();
    const inputPassword = formData.get("password");

    if (inputPassword === PASSWORD) {
      // === CẬP NHẬT TẠI ĐÂY ===
      // Max-Age=115200 tương đương 32 tiếng
      return new Response(null, {
        status: 302,
        headers: {
          "Location": "/",
          "Set-Cookie": `${authCookie}; Path=/; HttpOnly; Secure; Max-Age=115200`, 
        },
      });
    } else {
      return new Response(renderLoginPage("Mật khẩu không đúng, vui lòng thử lại!", true), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  }

  // 3. Mặc định: Hiện form đăng nhập
  return new Response(renderLoginPage(null, false), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Hàm tạo giao diện HTML (Giữ nguyên giao diện đẹp)
 */
function renderLoginPage(errorMsg, isError) {
  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrinhHG - Restricted Access</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; outline: none; }
    body {
      font-family: 'Montserrat', sans-serif;
      margin: 0;
      height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background-color: #f3f4f6;
      color: #374151;
    }
    .login-card {
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
      width: 100%;
      max-width: 400px;
      padding: 40px;
      border: 1px solid #e5e7eb;
      animation: slideIn 0.4s ease-out;
    }
    h2 {
      margin-top: 0;
      font-size: 24px;
      font-weight: 700;
      color: #111827;
      text-align: center;
      margin-bottom: 8px;
    }
    p.subtitle {
      text-align: center;
      color: #6b7280;
      font-size: 14px;
      margin-bottom: 30px;
    }
    .input-group { margin-bottom: 20px; }
    .input-label {
      display: block;
      font-size: 13px;
      font-weight: 700;
      color: #374151;
      margin-bottom: 8px;
    }
    .w-full-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      outline: none;
      font-size: 14px;
      transition: all 0.2s;
    }
    .w-full-input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
    }
    .btn {
      width: 100%;
      padding: 10px 16px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-size: 14px;
      font-weight: 600;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .btn-primary {
      background: #2563eb;
      color: white;
      box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    }
    .btn-primary:hover {
      background: #1d4ed8;
    }
    .btn-primary:active {
      transform: scale(0.98);
    }
    .notification.error {
      background: #fee2e2;
      color: #991b1b;
      padding: 10px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 20px;
      border-left: 4px solid #ef4444;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    @keyframes slideIn { 
      from { transform: translateY(20px); opacity: 0; } 
      to { transform: 0; opacity: 1; } 
    }
  </style>
</head>
<body>
  <div class="login-card">
    <h2>TrinhHG Access</h2>
    <p class="subtitle">Vui lòng nhập mật khẩu để tiếp tục</p>
    ${isError ? `<div class="notification error"><span>⚠️ ${errorMsg}</span></div>` : ''}
    <form method="POST">
      <div class="input-group">
        <label class="input-label" for="password">Mật khẩu bảo vệ</label>
        <input type="password" id="password" name="password" class="w-full-input" placeholder="Nhập mật khẩu..." required autofocus>
      </div>
      <button type="submit" class="btn btn-primary">Xác nhận truy cập</button>
    </form>
  </div>
</body>
</html>
  `;
}
