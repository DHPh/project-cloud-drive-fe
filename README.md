# Cloud Drive Frontend

Repo Next.js độc lập cho giao diện Cloud Drive. Mốc `DRIVE-01` giữ bố cục Drive từ bản Nuxt và hỗ trợ đăng nhập, mở thư mục, tìm kiếm, phân trang, upload, đổi tên, download và đăng xuất. Mốc `TRASH-01` bổ sung đưa từng tệp vào Thùng rác, xem danh sách và khôi phục về thư mục gốc. Mốc `SHARE-01` bổ sung cấp quyền theo tài khoản, hạn chia sẻ, thu hồi, link tệp và danh sách tệp được chia sẻ với mình. Repo backend `project-cloud-drive-be` cung cấp API, PostgreSQL và MinIO.

`DRIVE-02` bổ sung tạo, đổi tên và di chuyển thư mục bằng bộ chọn đích có breadcrumb và phân trang.

- [Thiết kế UX](docs/ux.md)
- [Bản OpenAPI của frontend](docs/contracts/openapi.yaml)

## Chạy local

Dùng Node.js 24. Khởi động backend và, nếu chạy kiểm thử giao diện, chuẩn bị fixture bằng `npm run db:setup` trong repo backend. Chạy hai lệnh sau từ gốc repo frontend.

```sh
npm ci
npm run dev
```

Mở [frontend local](http://127.0.0.1:3000). Backend dùng `APP_ORIGIN=http://127.0.0.1:3000`. Next.js chuyển `/api/v1` đến `http://127.0.0.1:3001` theo mặc định. Khi đổi địa chỉ API, sao chép `.env.example` thành `.env.local` rồi đổi `CLOUD_DRIVE_API_ORIGIN`. Khi đổi địa chỉ web, cập nhật `APP_ORIGIN` ở backend cho khớp.

## Đồng bộ hợp đồng

Backend duy trì bản chuẩn `docs/contracts/openapi.yaml`. Sao chép bản chuẩn từ revision backend tương ứng vào `docs/contracts/openapi.yaml` của frontend. Chạy `npm run generate:api` để cập nhật `src/lib/api-schema.d.ts`. Đưa bản OpenAPI, kiểu sinh và thay đổi sử dụng API vào cùng thay đổi frontend. `npm run check:api` kiểm tra kiểu đã sinh khớp bản sao trong repo này.

## Kiểm chứng

```sh
npm run check:api
npm run lint
npm run typecheck
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Chạy Playwright khi web và backend dùng fixture tổng hợp đã sẵn sàng. `PLAYWRIGHT_BASE_URL` mặc định là `http://127.0.0.1:3000`. Báo cáo HTML nằm trong `playwright-report/`.

## Triển khai trên Vercel

Import repo frontend, để **Root Directory** là gốc repo, chọn preset **Next.js** và **Node.js 24.x**. Dùng `npm ci` nếu ghi đè lệnh cài đặt, và `npm run build` nếu ghi đè lệnh build. Bật biến hệ thống để Next có thể kiểm tra cấu hình Vercel. [Thiết lập build Vercel](https://vercel.com/docs/builds/configure-a-build) · [Biến hệ thống Vercel](https://vercel.com/docs/environment-variables/system-environment-variables)

Trong môi trường Production, đặt `CLOUD_DRIVE_API_ORIGIN` thành origin HTTPS của backend, ví dụ `https://api.example.com`. Giá trị dùng cho rewrite `/api/v1` khi build và cho kiểm tra phiên SSR khi chạy. Trình duyệt vẫn gọi API trên origin của frontend. Backend đặt `APP_ORIGIN` đúng origin người dùng mở, ví dụ `https://drive.example.com`, để request ghi cùng origin được chấp nhận. [Next.js rewrites](https://nextjs.org/docs/app/api-reference/config/next-config-js/rewrites)

Nếu kiểm thử Preview có thao tác ghi, dùng hostname Preview ổn định và backend thử nghiệm có `APP_ORIGIN` trùng chính xác hostname đó. Mỗi backend hiện chấp nhận một origin. Khi đổi `CLOUD_DRIVE_API_ORIGIN`, triển khai lại frontend để cập nhật rewrite. [Môi trường Vercel](https://vercel.com/docs/deployments/environments)

Sau triển khai, xác nhận đăng nhập, tải lại `/drive` để kiểm tra SSR, upload tệp nhỏ và một tệp gần giới hạn backend, đổi tên có dấu, tải xuống và đăng xuất. Đối chiếu tên và nội dung tệp. Vercel áp dụng giới hạn thời gian riêng cho external rewrite nên cần chạy ca upload trên deployment trước khi chốt mức hỗ trợ. [Giới hạn Vercel](https://vercel.com/docs/limits)
