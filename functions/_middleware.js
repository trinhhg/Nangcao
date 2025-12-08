export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // 1. LẤY MẬT KHẨU TỪ KV
  let PASSWORD = null;
  try {
     PASSWORD = await env.PRO_2.get("SITE_PASSWORD");
  } catch (e) {
     console.log(e);
  }

  // Tạo mã cookie mong muốn từ mật khẩu hiện tại
  const currentAuth = `auth=${btoa(PASSWORD)}`; 
  const cookieHeader = request.headers.get("Cookie");

  // === TÍNH NĂNG MỚI: API KIỂM TRA TRẠNG THÁI ===
  // Trình duyệt sẽ gọi vào đây mỗi 5-10 giây
  if (url.pathname === "/api/check-status") {
      // Nếu cookie người dùng gửi lên KHỚP với mật khẩu hiện tại trong KV
      if (cookieHeader && cookieHeader.includes(currentAuth)) {
          return new Response("OK", { status: 200 }); // Vẫn an toàn
      } else {
          return new Response("Unauthorized", { status: 401 }); // Mật khẩu đã đổi -> ĐÁ RA
      }
  }
  // ===============================================

  // === TÍNH NĂNG ĐĂNG XUẤT ===
  if (url.pathname === "/logout") {
    return new Response(null, {
      status: 302,
      headers: {
        "Location": "/",
        "Set-Cookie": "auth=; Path=/; HttpOnly; Secure; Max-Age=0",
      },
    });
  }

  // === LOGIC CHÍNH ===
  if (!PASSWORD) {
     // Nếu lỗi KV, tạm thời cho qua hoặc chặn tùy bạn
  }
  
  // Kiểm tra Cookie để cho vào web
  if (cookieHeader && cookieHeader.includes(currentAuth)) {
    return next();
  }

  // Xử lý POST (Đăng nhập)
  if (request.method === "POST") {
    const formData = await request.formData();
    const inputPassword = formData.get("password");

    if (inputPassword === PASSWORD) {
      return new Response(null, {
        status: 302,
        headers: {
          "Location": "/",
          "Set-Cookie": `${currentAuth}; Path=/; HttpOnly; Secure; Max-Age=115200`, 
        },
      });
    } else {
      return new Response(renderLoginPage("Mật khẩu không đúng, vui lòng thử lại!", true), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }
  }

  // Mặc định: Hiện form đăng nhập
  return new Response(renderLoginPage(null, false), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function renderLoginPage(errorMsg, isError) {
  // ... (Giữ nguyên đoạn code HTML giao diện đẹp cũ của bạn ở đây) ...
  // Để tiết kiệm dòng tin nhắn, bạn copy lại phần HTML cũ dán vào đây nhé
  return `
    <!DOCTYPE html>
    <html lang="vi">
    </html>
  `;
}
