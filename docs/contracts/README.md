# Hợp đồng API phía frontend

[OpenAPI 0.10.0](openapi.yaml) là bản chụp hợp đồng Cloud Drive dùng để sinh kiểu TypeScript cho frontend. Bản này thêm danh sách quyền đã cấp, xem trước nội dung và tải thư mục dạng ZIP. Bản chuẩn nằm ở `docs/contracts/openapi.yaml` trong repo `project-cloud-drive-be`.

Khi API thay đổi, cập nhật hợp đồng và kiểm thử ở backend trước. Sau khi chốt phiên bản, thay bản chụp `docs/contracts/openapi.yaml` trong repo frontend bằng nội dung cùng phiên bản. Từ gốc repo frontend, chạy `npm run generate:api` để cập nhật `src/lib/api-schema.d.ts` và `npm run check:api` để kiểm tra bản sinh. Chạy Playwright với API cùng phiên bản cho luồng bị tác động.

Quá trình sinh kiểu và build dùng bản chụp trong repo frontend. Checkout riêng frontend có đủ hợp đồng để build.
