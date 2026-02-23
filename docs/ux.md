# Thiết kế UX frontend

Phạm vi áp dụng gồm DRIVE-01 và TRASH-01. Màn hình mới tiếp nối bố cục, theme, icon, breadcrumb và chế độ lưới/danh sách của Drive Nuxt. Các chức năng ngoài mốc hiện tại sẽ xuất hiện khi có luồng tương ứng. Đối chiếu desktop và mobile trên bản chạy với dữ liệu tổng hợp.

## Drive

1. **Bố cục và URL.** `/drive?folder=…` mở đúng thư mục và hỗ trợ Back/Forward. Rename và upload mở trong dialog ngay ở vùng nhìn. Liên kết điều hướng dùng thẻ link thật. Khi đăng nhập lại, giữ đích đến nội bộ hợp lệ.
2. **Phạm vi state.** Folder, tìm kiếm, bộ lọc và trang nằm trên URL. Đổi điều kiện lọc đưa về trang đầu. TanStack Query giữ dữ liệu theo phiên và tham số. Selection, dialog và trạng thái lưu nằm ở màn hình tương ứng. Request cũ được hủy hoặc bỏ qua khi đổi thư mục.
3. **Quyền và thao tác.** Hiển thị thao tác theo quyền do API cung cấp khi contract hỗ trợ. Backend thực thi quyền ở mọi request. Nút lưu phản hồi ngay và chặn bấm lặp khi đang gửi. Lỗi tiếp tục hiện gần thao tác để người dùng sửa hoặc thử lại.
4. **Trạng thái và upload.** Kiểm tra loading, thư mục trống, lọc rỗng, lỗi có retry và tên dài. Khi tải lại danh sách, giữ bố cục ổn định. Upload cho chọn lại cùng tệp và giữ từng tệp thất bại để retry. Với tệp chưa rõ kết quả do mất kết nối, hướng dẫn làm mới danh sách và kiểm tra trước khi gửi lại. Dùng số byte đã gửi khi hiện phần trăm tiến độ. Giữ nội dung đang nhập khi request lỗi hoặc người dùng đăng nhập lại trong cùng phiên thao tác. Bất kỳ nháp lưu qua reload nào cũng phải giới hạn theo tài khoản và form. Mật khẩu, token và nội dung tệp nằm ngoài bộ lưu nháp.
5. **Viewport và truy cập.** Kiểm tra `1280×720` với Windows scaling 125% và `390×844` ở mobile. Dialog hỗ trợ bàn phím, focus trả về nút mở, và thông báo có thể đọc bởi công nghệ hỗ trợ. Tìm kiếm tôn trọng IME tiếng Việt. Kiểm tra nội dung cắt cụt và vùng cuộn trên mobile.
6. **Quay lại và đăng xuất.** Khi đóng dialog, reset trạng thái gửi và lỗi của dialog. Khi đăng xuất hoặc đổi tài khoản, hủy request đang chạy, xóa dữ liệu cache theo phiên và nháp liên quan, và cập nhật các tab còn mở.

## Thùng rác

1. **Điểm vào và quyền.** Chủ sở hữu có thể đưa một tệp vào Thùng rác từ lưới hoặc danh sách Drive. Hộp thoại xác nhận hiển thị tên tệp và cho biết có thể khôi phục. Mục Thùng rác nằm ở thanh điều hướng desktop và menu mobile. `/trash` hỗ trợ mở trực tiếp và giữ đích đến qua đăng nhập.
2. **Danh sách và thao tác.** Trang Thùng rác hiển thị tên tệp, kích thước, thời điểm đưa vào thùng rác và nút Khôi phục. Số trang nằm trên URL và dữ liệu truy vấn gắn với tài khoản. Khôi phục thành công đưa tệp về thư mục cũ theo API. Cả hai thao tác làm mới những truy vấn Drive và Thùng rác liên quan. Màn hình chỉ đưa vào thùng rác hoặc khôi phục từng tệp.
3. **Phản hồi và phục hồi.** Tách trạng thái tải lần đầu, trống và lỗi có thể thử lại. Trong lúc gửi, khóa thao tác lặp. Nếu lỗi, giữ tệp cùng hành động để người dùng thử lại. Khi trang hiện tại không còn tệp sau khôi phục, chuyển đến trang còn dữ liệu gần nhất hoặc về trang đầu.
4. **Bàn phím và mobile.** Xác nhận mở với focus ở Hủy. Sau khi tệp rời danh sách, đưa focus đến nút thao tác của tệp kế cận, hoặc tiêu đề/nội dung chính khi không còn nút phù hợp. Thông báo kết quả qua vùng trạng thái có thể đọc bằng công nghệ hỗ trợ. Kiểm tra vùng bấm, tên tệp dài và phân trang tại cả hai viewport.

## Phạm vi PWA

Baseline ưu tiên trải nghiệm responsive. Khi bổ sung chế độ cài đặt, kiểm tra `100dvh`, safe area, nút quay lại từ deep link, input mobile tối thiểu 16 px, màn hình offline và thông báo cập nhật. Service worker chỉ được lưu tài nguyên công khai đã chọn. Tệp riêng, preview riêng và API xác thực nằm ngoài cache service worker. Chạy kiểm thử WebKit và kiểm tra standalone trên iOS trước khi phát hành PWA.
