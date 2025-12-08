export async function onRequest(context) {
  const { request, next, env } = context;
  
  // === SỬA ĐỔI QUAN TRỌNG TẠI ĐÂY ===
  // Lấy password từ KV Namespace có tên binding là PRO_2
  // Key cần lấy là "SITE_PASSWORD"
  let PASSWORD = null;
  try {
     PASSWORD = await env.PRO_2.get("SITE_PASSWORD");
  } catch (e) {
     // Nếu chưa cài đặt đúng binding, code sẽ không chết mà trả về null
     console.log("Lỗi không lấy được KV:", e);
  }

  // Debug: Nếu không tìm thấy mật khẩu trong KV
  if (!PASSWORD) {
      return new Response("LỖI CẤU HÌNH: Không tìm thấy mật khẩu trong KV (PRO_2) hoặc Key (SITE_PASSWORD) bị sai.", { status: 500 });
  }
  // ===================================

  // 1. Kiểm tra Cookie
  const cookieHeader = request.headers.get("Cookie");
  const authCookie = `auth=${btoa(PASSWORD)}`; 
  
  if (cookieHeader && cookieHeader.includes(authCookie)) {
    return next();
  }

  // 2. Xử lý khi bấm nút Đăng nhập (POST)
  if (request.method === "POST") {
    const formData = await request.formData();
    const inputPassword = formData.get("password");

    if (inputPassword === PASSWORD) {
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

  // 3. Mặc định: Trả về trang đăng nhập
  return new Response(renderLoginPage(null, false), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * Hàm vẽ giao diện HTML/CSS (Đã bao gồm DONATE và link Telegram)
 */
function renderLoginPage(errorMsg, isError) {
  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrinhHG - Restricted Access</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; outline: none; }
    body {
      font-family: 'Montserrat', sans-serif;
      margin: 0;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background-color: #f3f4f6;
      color: #374151;
      padding: 20px;
    }
    .login-card {
      background: white;
      border-radius: 12px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      width: 100%;
      max-width: 450px;
      padding: 40px;
      border: 1px solid #e5e7eb;
      animation: slideIn 0.4s ease-out;
      display: flex;
      flex-direction: column;
    }
    h2 { margin-top: 0; font-size: 24px; font-weight: 700; color: #111827; text-align: center; margin-bottom: 8px; }
    p.subtitle { text-align: center; color: #6b7280; font-size: 14px; margin-bottom: 25px; }
    .input-group { margin-bottom: 20px; }
    .input-label { display: block; font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 8px; }
    .w-full-input { width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; outline: none; font-size: 14px; transition: all 0.2s; }
    .w-full-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1); }
    .btn { width: 100%; padding: 12px 16px; border-radius: 8px; border: none; cursor: pointer; font-size: 14px; font-weight: 700; transition: all 0.2s; display: inline-flex; align-items: center; justify-content: center; text-transform: uppercase; letter-spacing: 0.5px; }
    .btn-primary { background: #2563eb; color: white; box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.2); }
    .btn-primary:hover { background: #1d4ed8; transform: translateY(-1px); }
    .btn-primary:active { transform: scale(0.98); }
    .extra-info { margin-top: 25px; padding-top: 20px; border-top: 1px dashed #e5e7eb; text-align: center; display: flex; flex-direction: column; gap: 15px; }
    .telegram-link { font-size: 13px; color: #4b5563; font-weight: 600; }
    .telegram-link a { color: #2563eb; text-decoration: none; font-weight: 700; }
    .telegram-link a:hover { text-decoration: underline; }
    .donate-box { background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px; }
    .donate-label { color: #dc2626; font-weight: 800; font-size: 12px; display: block; margin-bottom: 4px; text-transform: uppercase; }
    .donate-details { color: #991b1b; font-weight: 700; font-size: 13px; line-height: 1.5; }
    .notification.error { background: #fee2e2; color: #991b1b; padding: 12px; border-radius: 8px; font-size: 13px; font-weight: 600; margin-bottom: 20px; border-left: 4px solid #ef4444; display: flex; align-items: center; gap: 8px; }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: 0; opacity: 1; } }
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
      <button type="submit" class="btn btn-primary">Xác minh truy cập</button>
    </form>
    <div class="extra-info">
      <div class="telegram-link">
        Lấy mật khẩu xác minh free tại: <a href="https://t.me/trinhhg57" target="_blank">t.me/trinhhg57</a>
      </div>
      <div class="donate-box">
        <span class="donate-label">DON@TE (MOMO/MB BANK)</span>
        <div class="donate-details">TRINH THI XUAN HUONG<br>0917678211</div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}
