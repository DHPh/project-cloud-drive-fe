# Thiết kế UX frontend

Phạm vi áp dụng gồm DRIVE-01, DRIVE-02, TRASH-01, TRASH-02, TRASH-03, SHARE-01 và SHARE-02. Màn hình mới tiếp nối bố cục, theme, icon, breadcrumb và chế độ lưới/danh sách của Drive Nuxt. Đối chiếu desktop và mobile trên bản chạy với dữ liệu tổng hợp.

## Drive

1. **Bố cục và URL.** `/drive?folder=…` mở đúng thư mục và hỗ trợ Back/Forward. Rename và upload mở trong dialog ngay ở vùng nhìn. Liên kết điều hướng dùng thẻ link thật. Khi đăng nhập lại, giữ đích đến nội bộ hợp lệ.
2. **Phạm vi state.** URL giữ `folder`, `q`, `page` và `view`. Đổi thư mục hoặc từ khóa đưa về trang đầu. Khóa truy vấn Drive gồm tài khoản, thư mục, từ khóa và trang. Giữ dữ liệu trước trong cùng thư mục khi truy vấn mới đang tải. Dialog, bản nhập và trạng thái gửi thuộc màn hình đang thao tác.
3. **Quyền và thao tác.** Chỉ hiện hành động phù hợp sau khi xác nhận quyền từ API. Khi chưa đọc xong hoặc nhận lỗi truy cập, hiển thị trạng thái tương ứng và ẩn dữ liệu cần quyền. Nút lưu phản hồi ngay và chặn bấm lặp khi đang gửi. Lỗi tiếp tục hiện gần thao tác để người dùng sửa hoặc thử lại. Tải xuống dùng link tải có tên tệp hiển thị.
4. **Trạng thái và upload.** Kiểm tra loading, thư mục trống, lọc rỗng, lỗi có retry và tên dài. Khi tải lại danh sách, giữ bố cục ổn định. Upload cho chọn lại cùng tệp và giữ từng tệp thất bại để retry. Với tệp chưa rõ kết quả do mất kết nối, hướng dẫn làm mới danh sách và kiểm tra trước khi gửi lại. Dùng số byte đã gửi khi hiện phần trăm tiến độ. Giữ nội dung đang nhập khi request lỗi hoặc người dùng đăng nhập lại trong cùng phiên thao tác. Bất kỳ nháp lưu qua reload nào cũng phải giới hạn theo tài khoản và form. Mật khẩu, token và nội dung tệp nằm ngoài bộ lưu nháp.
5. **Viewport và truy cập.** Playwright dùng viewport `1280×720` với DPR 1,25 và mobile giả lập `390×844`. Dialog hỗ trợ bàn phím, focus trả về nút mở, và thông báo có thể đọc bởi công nghệ hỗ trợ. Tìm kiếm đợi kết thúc phiên nhập IME trước khi gửi từ khóa. Kiểm tra nội dung cắt cụt và vùng cuộn trên mobile.
6. **Quay lại và đăng xuất.** Khi đóng dialog, reset trạng thái gửi và lỗi của dialog. Khi đăng xuất hoặc đổi tài khoản, hủy request đang chạy, xóa dữ liệu cache theo phiên và nháp liên quan, và cập nhật các tab còn mở.

## Quản lý thư mục

1. **Điểm vào.** **Mới → Tạo thư mục** tạo tại vị trí Drive đang mở. Hàng và thẻ thư mục có **Đổi tên** và **Di chuyển**. Link mở thư mục dùng ID nên giữ nguyên khi thư mục đổi tên hoặc đổi cha.
2. **Chọn đích và quyền.** Hộp thoại di chuyển bắt đầu ở Drive gốc, dùng breadcrumb và danh sách chỉ gồm thư mục có phân trang. Lựa chọn đích và số trang thuộc hộp thoại. Thư mục nguồn và đường vào các thư mục con của nguồn không xuất hiện trong bộ chọn. **Chuyển tới đây** chỉ khả dụng khi đích đã tải và khác thư mục cha hiện tại. Backend kiểm tra quyền, tên trùng và vòng lặp.
3. **Lỗi và kết quả.** Giữ tên hoặc đích đang chọn khi lỗi. Phân biệt đang tải đích, không có thư mục con, lỗi truy vấn có thể thử lại và lỗi lưu. Khi thành công, làm mới danh sách và breadcrumb thuộc tài khoản hiện tại. Giữ URL Drive và hiển thị link mở đích sau khi di chuyển.
4. **Bàn phím và mobile.** Tạo/đổi tên đưa focus vào trường tên. Duyệt đích trong hộp thoại đưa focus đến tiêu đề đích. Khi hủy hoặc lưu tên, trả focus về nút mở nếu còn hiển thị. Sau khi di chuyển, focus về thao tác thư mục kế cận hoặc nội dung chính. Kiểm tra thao tác với bàn phím, tên dài, vùng bấm và phân trang desktop/mobile.

## Thùng rác

Mục Thùng rác nằm ở thanh điều hướng desktop và menu mobile. `/trash` hỗ trợ mở trực tiếp và giữ đích đến qua đăng nhập. URL giữ số trang, truy vấn phân theo tài khoản và trang. Các luồng khôi phục dùng trạng thái tải lần đầu, trống và lỗi có thể thử lại. Khóa thao tác lặp khi gửi, giữ mục khi có lỗi và về trang còn dữ liệu gần nhất khi trang hiện tại hết mục.

### TRASH-01 · Từng tệp

1. **Điểm vào.** Chủ tệp mở hộp thoại đưa vào Thùng rác từ lưới hoặc danh sách. Hộp thoại nêu tên tệp, khả năng khôi phục và tác động đến chia sẻ. Trong Thùng rác, mỗi tệp xóa riêng hiện tên, kích thước, thời điểm xóa và nút Khôi phục.
2. **Phản hồi.** Sau khi cập nhật thành công, làm mới danh sách Drive, Thùng rác và quyền liên quan. Nếu API khôi phục về Drive gốc để giữ riêng tư, vùng trạng thái giải thích đích. Dùng dữ liệu thực tế của lần khôi phục khi xây link mở đích.
3. **Bàn phím.** Focus ban đầu vào Hủy. Khi đóng hộp thoại trước thao tác, trả focus về nút mở. Sau khi tệp rời danh sách, ưu tiên thao tác kế cận hoặc tiêu đề/nội dung chính. Vùng trạng thái báo kết quả cho công nghệ hỗ trợ.

### TRASH-02 · Cả cây thư mục

1. **Xác nhận và danh sách.** Hộp thoại thư mục nêu phạm vi cả cây hoạt động. Danh sách hỗn hợp phân biệt tệp và thư mục. Mỗi cây có một mục, gồm tên thư mục gốc và thời điểm đưa vào Thùng rác. Tệp hoặc thư mục xóa riêng vẫn được hiển thị theo mục riêng của nó.
2. **Khôi phục và trùng tên.** Dùng `kind` để gọi đúng thao tác. Khi API trả tên mới hoặc đích mới, hiển thị tên được khôi phục, giải thích thay đổi và link mở vị trí đích. Đường dẫn đến mục dùng ID để tiếp tục mở đúng sau khi đổi tên. Làm mới danh sách và quyền thuộc cây bị tác động sau khi hoàn tất.
3. **Desktop và mobile.** Dùng cùng hành vi focus như tệp. Kiểm tra thao tác bàn phím, vùng bấm, tên dài, phân trang và vùng nhìn chứa thông báo cùng link đích trên cả hai viewport.

### Xóa vĩnh viễn và dọn Thùng rác

1. **Điểm vào và phạm vi.** Trên `/trash`, từng mục còn khôi phục được có hành động **Xóa vĩnh viễn**. **Dọn Thùng rác** áp dụng toàn bộ tài khoản, gồm các trang khác. Hộp thoại nêu rõ tên hoặc phạm vi và thời điểm mất khả năng khôi phục. Nút Hủy nhận focus đầu tiên. Khi đóng, trả focus về nơi mở nếu còn khả dụng.
2. **Nguồn trạng thái.** URL giữ số trang. Truy vấn Thùng rác theo tài khoản nhận thời hạn, dung lượng còn tính và trạng thái xử lý từ API. Trong lúc đang xóa hoặc thử lại, làm mới dữ liệu theo lịch và sau khi tab lấy focus. Ngày dọn hiển thị theo giờ Việt Nam. Chỉ hiện nút khôi phục hoặc xóa tay với mục còn khả dụng.
3. **Gửi yêu cầu và phục hồi.** Gắn yêu cầu vào ID lần xóa của mục. Khi dọn toàn bộ, giữ ID yêu cầu của cùng lần xác nhận khi thử lại sau lỗi mạng. Khóa bấm lặp khi đang gửi. Sau khi API nhận lệnh, làm mới trạng thái và chặn hành động trên dữ liệu cũ. Thông báo đã nhận lệnh phân biệt với thông báo xóa hoàn tất. Trạng thái đang xử lý, đang thử lại và dung lượng còn tính cập nhật khi tải lại trang.
4. **Bàn phím và mobile.** Sau khi xác nhận, chuyển focus về thao tác bên cạnh hoặc tiêu đề nếu mục đã rời danh sách. Thông báo qua vùng trạng thái để công nghệ hỗ trợ đọc được. Kiểm tra hộp thoại, lỗi có thể thử lại, tên dài, phân trang và vùng bấm trên cả hai viewport.

## Chia sẻ tệp

1. **Điểm vào và quyền.** Chủ tệp mở **Chia sẻ** từ hàng hoặc thẻ tệp trong Drive. Hộp thoại cấp quyền theo email tài khoản đã có và hiển thị người nhận, hạn hiệu lực và trạng thái hết hạn. Link `/files/{id}` dùng để mở trang thông tin tệp. Backend kiểm tra tài khoản khi mở thông tin và tải xuống. Trang **Được chia sẻ với tôi** và link tệp giữ đích đến qua đăng nhập.
2. **Thời hạn và thao tác.** Nhập hạn cho từng người nhận theo giờ Việt Nam. Với quyền mới hoặc quyền đã hết hạn, để trống dùng một tháng lịch tính từ lúc cấp. Quyền đang hiệu lực giữ hạn khi gửi lại không kèm hạn. Sau khi cấp hoặc sửa hạn, hiển thị giờ hiệu lực do API trả về. Thu hồi yêu cầu xác nhận ngay trong hộp thoại. Khi đưa tệp vào Thùng rác, cảnh báo các quyền cũ sẽ bị thu hồi.
3. **Dữ liệu và phản hồi.** Danh sách người nhận gắn với tài khoản, tệp và trang đang xem trong hộp thoại. Số trang của `/shared-with-me` nằm trên URL. Giữ nội dung đang nhập nếu gửi lỗi, khóa thao tác lặp và làm mới danh sách khi API xác nhận thay đổi. Hộp thoại và danh sách nhận đặt lịch đọc lại theo hạn đang hiển thị. Trang chi tiết kiểm tra lại quyền khi mở hoặc cửa sổ lấy focus. Tách trạng thái tải, trống, lỗi có thể thử lại và tệp không truy cập được. Nếu trình duyệt không sao chép được link, giữ link có thể chọn bằng tay.
4. **Bàn phím và mobile.** Focus vào email khi mở và trở về nút Chia sẻ khi đóng. Chỉnh thời hạn đưa focus đến ô ngày giờ. Xác nhận thu hồi bắt đầu ở Hủy và trả focus về thao tác phù hợp hoặc trường email sau khi dòng biến mất. Kiểm tra tên tệp dài, vùng bấm, trường ngày giờ và hành vi trên `1280×720` và `390×844`.

## Chia sẻ thư mục

1. **Điểm vào và URL.** Chủ thư mục mở **Chia sẻ** trên hàng hoặc thẻ thư mục. Hộp thoại dùng cùng quy tắc hạn và bàn phím với chia sẻ tệp, sao chép link `/drive?folder={id}`. **Được chia sẻ với tôi** có hai tab điều hướng **Tệp** và **Thư mục**. Tab và trang hiện tại được giữ trong URL, kể cả khi đăng nhập từ link.
2. **Quyền xem.** Dùng quyền `owner` hoặc `viewer` từ API. Khi là người xem, hiển thị trạng thái **Chỉ xem**, breadcrumb bắt đầu ở mục cao nhất được phép và mọi thao tác ghi được ẩn. Người nhận có thể mở thư mục con, xem thông tin tệp và tải xuống trong phạm vi được phép. Hai tab liệt kê các mục chia sẻ trực tiếp.
3. **Di chuyển và khôi phục.** Chủ tệp dùng bộ chọn đích có phân trang để di chuyển từng tệp. Nội dung đi theo quyền qua thư mục ở vị trí mới. Sau khi di chuyển, giữ danh sách nguồn, trả focus về thao tác kế cận hoặc nội dung chính và hiển thị link mở đích. Khi khôi phục về Drive gốc vì vị trí gốc đang chia sẻ, thông báo rõ để chủ tệp biết nơi tìm tệp.
4. **Trạng thái và bàn phím.** Khóa truy vấn danh sách nhận gồm tài khoản, tab và số trang. Khi đổi tab, đọc đúng loại mục rồi hiện danh sách, trạng thái trống hoặc lỗi tải của tab đó. Nút điều hướng thư mục và tệp là link thật. Khi mở thư mục được chia sẻ, đợi xác nhận quyền để dựng breadcrumb và các thao tác phù hợp. Kiểm tra link sâu, chuyển tab, tên dài, đọc trạng thái **Chỉ xem** và thao tác bằng bàn phím ở hai viewport.

## Phạm vi PWA

Baseline ưu tiên trải nghiệm responsive. Khi bổ sung chế độ cài đặt, kiểm tra `100dvh`, safe area, nút quay lại từ deep link, input mobile tối thiểu 16 px, màn hình offline và thông báo cập nhật. Service worker chỉ được lưu tài nguyên công khai đã chọn. Tệp riêng, preview riêng và API xác thực nằm ngoài cache service worker. Chạy kiểm thử WebKit và kiểm tra standalone trên iOS trước khi phát hành PWA.
