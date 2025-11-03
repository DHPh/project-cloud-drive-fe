# Chỉ dẫn frontend

- Đọc [thiết kế UX](docs/ux.md) trước khi đổi màn hình. Khi thêm tính năng hoặc màn hình, mô tả route, quyền, nguồn state, trạng thái lỗi/tải, viewport và hành vi khi quay lại trước khi viết component.
- Nếu chỉ mục `.local-docs/README.md` có sẵn, đọc skill UX theo loại thay đổi. Dùng style và nội dung của Cloud Drive cho triển khai.
- Lấy request, response và mã lỗi từ [hợp đồng API](../docs/contracts/README.md). Khi API thiếu hành vi cần thiết, cập nhật hợp đồng cùng backend trước khi tích hợp.
- Kiểm chứng luồng bị tác động bằng bàn phím, desktop và mobile. Với ca lỗi, kiểm tra dữ liệu đang nhập và khả năng thử lại.
