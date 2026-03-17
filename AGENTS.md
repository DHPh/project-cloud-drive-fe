# Chỉ dẫn frontend

- Đọc [thiết kế UX](docs/ux.md) trước khi đổi màn hình. Khi thêm tính năng hoặc màn hình, mô tả route, quyền, nguồn state, trạng thái lỗi/tải, viewport và hành vi khi quay lại trước khi viết component.
- Nếu có bộ tài liệu local trong môi trường làm việc, đọc quy tắc frontend và dùng mẫu thiết kế UX cho màn hình mới. Giữ tài liệu local, đoạn trích và đường dẫn máy ngoài Git, báo cáo đính kèm và build context.
- Backend sở hữu hợp đồng chuẩn. Dùng [bản OpenAPI tại repo này](docs/contracts/openapi.yaml) cho request, response và mã lỗi. Khi hợp đồng đổi, đồng bộ bản sao từ backend và chạy `npm run generate:api` cùng thay đổi phía frontend.
- Kiểm chứng luồng bị tác động bằng fixture tổng hợp, bàn phím, desktop và mobile. Với ca lỗi, kiểm tra dữ liệu đang nhập và khả năng thử lại. Xem lệnh trong [README](README.md) và ghi kết quả thực tế khi bàn giao.
- Trong cùng mốc triển khai, cập nhật [thiết kế UX](docs/ux.md) theo hành vi đã nghiệm thu. Khi tìm thấy hướng dẫn cũ lệch giao diện, đối chiếu và sửa trong mốc liên quan.
