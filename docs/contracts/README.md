# Hợp đồng API phía frontend

[OpenAPI 0.6.0](openapi.yaml) là bản chụp hợp đồng Cloud Drive dùng để sinh kiểu TypeScript cho frontend. Bản này bổ sung thao tác cho cây thư mục, tham số `includeFolders=true` trên danh sách Thùng rác và tên thực tế sau khôi phục. Frontend cần backend `0.6.0` để dùng các hành vi này. Bản chuẩn nằm ở `docs/contracts/openapi.yaml` trong repo `project-cloud-drive-be`.

Khi API thay đổi, cập nhật hợp đồng và kiểm thử ở backend trước. Sau khi chốt phiên bản, thay bản chụp `docs/contracts/openapi.yaml` trong repo frontend bằng nội dung cùng phiên bản. Từ gốc repo frontend, chạy `npm run generate:api` để cập nhật `src/lib/api-schema.d.ts` và `npm run check:api` để kiểm tra bản sinh. Chạy Playwright với API cùng phiên bản cho luồng bị tác động.

Quá trình sinh kiểu và build dùng bản chụp trong repo frontend. Checkout riêng frontend có đủ hợp đồng để build.
