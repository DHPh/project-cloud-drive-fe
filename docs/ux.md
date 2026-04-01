# Thiết kế UX frontend

Phạm vi áp dụng gồm DRIVE-01, DRIVE-02, DRIVE-03, TRASH-01, TRASH-02, TRASH-03, SHARE-01 và SHARE-02. Màn hình mới tiếp nối bố cục, theme, icon, breadcrumb và chế độ lưới/danh sách của Drive Nuxt. Đối chiếu desktop và mobile trên bản chạy với dữ liệu tổng hợp.

## Drive

1. **Bố cục và URL.** `/drive?folder=…` mở đúng thư mục và hỗ trợ Back/Forward. Rename và upload mở trong dialog ngay ở vùng nhìn. Liên kết điều hướng dùng thẻ link thật. Khi đăng nhập lại, giữ đích đến nội bộ hợp lệ.
2. **Phạm vi state.** URL giữ `folder`, `q`, `page` và `view`. Đổi thư mục hoặc từ khóa đưa về trang đầu. Khóa truy vấn Drive gồm tài khoản, thư mục, từ khóa và trang. Giữ dữ liệu trước trong cùng thư mục khi truy vấn mới đang tải. Dialog, bản nhập và trạng thái gửi thuộc màn hình đang thao tác.
3. **Quyền và thao tác.** Chỉ hiện hành động phù hợp sau khi xác nhận quyền từ API. Khi chưa đọc xong hoặc nhận lỗi truy cập, hiển thị trạng thái tương ứng và ẩn dữ liệu cần quyền. Nút lưu phản hồi ngay và chặn bấm lặp khi đang gửi. Lỗi tiếp tục hiện gần thao tác để người dùng sửa hoặc thử lại. Tải xuống dùng link tải có tên tệp hiển thị.
4. **Trạng thái và upload.** Kiểm tra loading, thư mục trống, lọc rỗng, lỗi có retry và tên dài. Khi tải lại danh sách, giữ bố cục ổn định. Upload cho chọn lại cùng tệp và giữ từng tệp thất bại để retry. Với tệp chưa rõ kết quả do mất kết nối, hướng dẫn làm mới danh sách và kiểm tra trước khi gửi lại. Dùng số byte đã gửi khi hiện phần trăm tiến độ. Giữ nội dung đang nhập khi request lỗi hoặc người dùng đăng nhập lại trong cùng phiên thao tác. Bất kỳ nháp lưu qua reload nào cũng phải giới hạn theo tài khoản và form. Mật khẩu, token và nội dung tệp nằm ngoài bộ lưu nháp.
5. **Viewport và truy cập.** Playwright dùng viewport `1280×720` với DPR 1,25 và mobile giả lập `390×844`. Dialog hỗ trợ bàn phím, focus trả về nút mở, và thông báo có thể đọc bởi công nghệ hỗ trợ. Tìm kiếm đợi kết thúc phiên nhập IME trước khi gửi từ khóa. Kiểm tra nội dung cắt cụt và vùng cuộn trên mobile.
6. **Quay lại và đăng xuất.** Khi đóng dialog, reset trạng thái gửi và lỗi của dialog. Khi đăng xuất hoặc đổi tài khoản, hủy request đang chạy, xóa dữ liệu cache theo phiên và nháp liên quan, và cập nhật các tab còn mở.

## Quản lý thư mục

1. **Điểm vào.** **Mới → Tạo thư mục** tạo tại vị trí Drive đang mở. Hàng và thẻ thư mục có **Đổi tên thư mục và sửa mô tả** từ DRIVE-03, cùng **Di chuyển**. Link mở thư mục dùng ID nên giữ nguyên khi thư mục đổi tên hoặc đổi cha. [Biểu mẫu và trạng thái DRIVE-03](#chi-tiết-tệp-và-metadata)
2. **Chọn đích và quyền.** Hộp thoại di chuyển bắt đầu ở Drive gốc, dùng breadcrumb và danh sách chỉ gồm thư mục có phân trang. Lựa chọn đích và số trang thuộc hộp thoại. Thư mục nguồn và đường vào các thư mục con của nguồn không xuất hiện trong bộ chọn. **Chuyển tới đây** chỉ khả dụng khi đích đã tải và khác thư mục cha hiện tại. Backend kiểm tra quyền, tên trùng và vòng lặp.
3. **Lỗi và kết quả.** Giữ tên hoặc đích đang chọn khi lỗi. Phân biệt đang tải đích, không có thư mục con, lỗi truy vấn có thể thử lại và lỗi lưu. Khi thành công, làm mới danh sách và breadcrumb thuộc tài khoản hiện tại. Giữ URL Drive và hiển thị link mở đích sau khi di chuyển.
4. **Bàn phím và mobile.** Tạo hoặc đổi tên đưa focus vào trường tên. Khi chuyển đích, đưa focus đến tiêu đề ngay khi tiêu đề đích xuất hiện. Giữ focus ở vị trí người dùng đã chọn khi danh sách trả về. Khi hủy hoặc lưu tên, trả focus về nút mở nếu còn hiển thị. Sau khi di chuyển, focus về thao tác thư mục kế cận hoặc nội dung chính. Kiểm tra thao tác với bàn phím, tên dài, vùng bấm và phân trang desktop/mobile.

## Chi tiết tệp và metadata

1. **Điểm vào và quay lại.** Tên tệp trong lưới và danh sách mở `/files/{id}`. Sau khi đọc được quyền, link quay về dẫn chủ sở hữu đến thư mục chứa tệp hoặc Drive gốc, người xem đến **Được chia sẻ với tôi**. Back/Forward dùng lịch sử trình duyệt để quay lại vị trí Drive, từ khóa, trang và chế độ xem đã mở.
2. **Quyền và dữ liệu.** Chi tiết dùng `access` do API trả sau khi xác nhận quyền hiện hành. Chủ sở hữu có nút **Sửa mô tả và thẻ**. Người xem đọc metadata theo phạm vi chia sẻ. Trang hiển thị các trường có giá trị và ngắt dòng văn bản dài. Khóa truy vấn chi tiết gồm tài khoản và ID tệp. Biểu mẫu và trạng thái lưu thuộc dialog.
3. **Biểu mẫu tệp.** Nhập mô tả nhiều dòng và thêm từng thẻ bằng nút thêm hoặc Enter sau khi kết thúc phiên nhập IME. Dấu phẩy nằm trong nội dung thẻ. Kiểm tra thẻ trùng chính xác và giới hạn số lượng. Lưu gửi phần thay đổi, dùng `null` khi xóa mô tả và `[]` khi gỡ hết thẻ. Khi lỗi, giữ mô tả, thẻ và phần đang nhập để sửa hoặc thử lại.
4. **Biểu mẫu thư mục.** Tạo hoặc sửa thư mục có ô mô tả tùy chọn. Mô tả có nội dung xuất hiện dưới breadcrumb của thư mục đang mở. Gửi `null` khi xóa mô tả. Khóa truy vấn Drive giữ tài khoản, thư mục, tìm kiếm và trang như trên.
5. **Sau khi lưu.** Với tệp, hủy lượt đọc đang chờ trước khi cập nhật metadata vào cache chi tiết. Giữ thông tin quyền từ lần đọc, đọc lại chi tiết và làm mới truy vấn Drive. Với thư mục, làm mới truy vấn Drive và bộ chọn đích của tài khoản. Vùng trạng thái báo kết quả sau thao tác.
6. **Bàn phím và responsive.** Focus vào mô tả trong dialog tệp, vào tên trong dialog thư mục. Giữ focus trong dialog. Escape hoặc Hủy khi có thay đổi mở bước xác nhận bỏ bản nhập. Khi đóng, trả focus về nút mở nếu còn hiển thị hoặc nội dung chính. Kiểm tra mô tả và thẻ theo giới hạn code point Unicode, tên nút gỡ từng thẻ, vùng cuộn và tràn ngang ở hai viewport.

## Tải thư mục dạng ZIP

Khi mở một thư mục đang có quyền đọc, hành động **Tải ZIP** chuẩn bị gói tải xuống với phản hồi bên cạnh nút. Khóa gửi lặp trong khi chuẩn bị. Giữ thao tác dùng bàn phím và màn hình vừa chiều rộng. Báo lỗi, giới hạn và cách chọn phạm vi nhỏ hơn khi tải thất bại.

## Xem trước nội dung tệp

Từ trang chi tiết, chủ hoặc người có quyền đọc mở **Xem trước** trong cùng màn hình. Phân biệt đang tải, định dạng chưa hỗ trợ, vượt giới hạn, mất quyền và lỗi có thể thử lại. Văn bản hiển thị nguyên văn, ảnh và PDF dùng vùng hiển thị đã cô lập. Giữ thao tác tải xuống theo quyền, nhãn điều khiển và vùng cuộn trên desktop/mobile. Dữ liệu xem trước riêng gắn với phiên và được dọn khi đổi mục hoặc đóng.

## Tìm toàn Drive và Dòng thời gian

1. **Điểm vào.** Giữ tìm trong thư mục đang mở và thêm điểm vào **Tìm toàn Drive của tôi** ở Drive của chủ. Dòng thời gian có link trong thanh bên và menu mobile. Kết quả mở đúng chi tiết tệp hoặc thư mục bằng URL thật và hiển thị đường dẫn vị trí.
2. **Trạng thái.** URL giữ từ khóa, tùy chọn metadata, loại, sắp xếp, khoảng ngày và số trang. Đổi từ khóa hoặc lọc về trang đầu. Đồng bộ khi reload và Back/Forward. Đợi IME và bỏ phản hồi đến sai thứ tự. Hiển thị ngày theo giờ Việt Nam.
3. **Phản hồi và trợ năng.** Phân biệt chưa nhập, không có kết quả, đang tải và lỗi có thể thử lại. Báo khoảng ngày không hợp lệ tại vùng bộ lọc. Kiểm tra bàn phím, focus và co vừa desktop/mobile.

## Thùng rác

Mục Thùng rác nằm ở thanh điều hướng desktop và menu mobile. `/trash` hỗ trợ mở trực tiếp và giữ đích đến qua đăng nhập. URL giữ số trang, truy vấn phân theo tài khoản và trang. Các luồng khôi phục dùng trạng thái tải lần đầu, trống và lỗi có thể thử lại. Khóa thao tác lặp khi gửi, giữ mục khi có lỗi và về trang còn dữ liệu gần nhất khi trang hiện tại hết mục.

### TRASH-01 · Từng tệp

1. **Điểm vào.** Chủ tệp mở hộp thoại đưa vào Thùng rác từ lưới hoặc danh sách. Hộp thoại nêu tên tệp, khả năng khôi phục và tác động đến chia sẻ. Trong Thùng rác, mỗi tệp xóa riêng hiện tên, kích thước, thời điểm xóa và nút Khôi phục.
2. **Phản hồi.** Sau khi cập nhật thành công, làm mới danh sách Drive, Thùng rác và quyền liên quan. Nếu API khôi phục về Drive gốc để giữ riêng tư, vùng trạng thái giải thích đích. Dùng dữ liệu thực tế của lần khôi phục khi xây link mở đích.
3. **Bàn phím.** Focus ban đầu vào Hủy. Khi đóng hộp thoại trước thao tác, trả focus về nút mở. Sau khi tệp rời danh sách, ưu tiên thao tác kế cận hoặc tiêu đề/nội dung chính. Vùng trạng thái báo kết quả cho công nghệ hỗ trợ.

### TRASH-02 · Cả cây thư mục

1. **Xác nhận và danh sách.** Hộp thoại thư mục nêu phạm vi cả cây hoạt động. Danh sách hỗn hợp phân biệt tệp và thư mục. Mỗi cây có một mục, gồm tên thư mục gốc và thời điểm đưa vào Thùng rác. Tệp hoặc thư mục xóa riêng vẫn được hiển thị theo mục riêng của nó.
2. **Khôi phục và trùng tên.** Dùng `kind` để gọi đúng thao tác. Khi API trả tên mới hoặc đích mới, hiển thị tên được khôi phục, giải thích thay đổi và link mở vị trí đích. Đường dẫn đến mục dùng ID để tiếp tục mở đúng sau khi đổi tên. Làm mới danh sách và quyền thuộc cây bị tác động sau khi hoàn tất.
   Mở đích để đọc [mô tả và thẻ còn trên mục khôi phục](#chi-tiết-tệp-và-metadata).
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

Trang [chi tiết tệp](#chi-tiết-tệp-và-metadata) dùng quyền đọc mới nhất để quyết định hiển thị thao tác sửa cho chủ sở hữu.

## Chia sẻ thư mục

1. **Điểm vào và URL.** Chủ thư mục mở **Chia sẻ** trên hàng hoặc thẻ thư mục. Hộp thoại dùng cùng quy tắc hạn và bàn phím với chia sẻ tệp, sao chép link `/drive?folder={id}`. **Được chia sẻ với tôi** có hai tab điều hướng **Tệp** và **Thư mục**. Tab và trang hiện tại được giữ trong URL, kể cả khi đăng nhập từ link.
2. **Quyền xem.** Dùng quyền `owner` hoặc `viewer` từ API. Khi là người xem, hiển thị trạng thái **Chỉ xem**, breadcrumb bắt đầu ở mục cao nhất được phép và mọi thao tác ghi được ẩn. Người nhận có thể mở thư mục con, xem thông tin tệp và tải xuống trong phạm vi được phép. Hai tab liệt kê các mục chia sẻ trực tiếp.
3. **Di chuyển và khôi phục.** Chủ tệp dùng bộ chọn đích có phân trang để di chuyển từng tệp. Nội dung đi theo quyền qua thư mục ở vị trí mới. Sau khi di chuyển, giữ danh sách nguồn, trả focus về thao tác kế cận hoặc nội dung chính và hiển thị link mở đích. Khi khôi phục về Drive gốc vì vị trí gốc đang chia sẻ, thông báo rõ để chủ tệp biết nơi tìm tệp.
4. **Trạng thái và bàn phím.** Khóa truy vấn danh sách nhận gồm tài khoản, tab và số trang. Khi đổi tab, đọc đúng loại mục rồi hiện danh sách, trạng thái trống hoặc lỗi tải của tab đó. Nút điều hướng thư mục và tệp là link thật. Khi mở thư mục được chia sẻ, đợi xác nhận quyền để dựng breadcrumb và các thao tác phù hợp. Kiểm tra link sâu, chuyển tab, tên dài, đọc trạng thái **Chỉ xem** và thao tác bằng bàn phím ở hai viewport.

Người xem đọc [mô tả thư mục](#chi-tiết-tệp-và-metadata) khi mở được thư mục. Tab Thư mục tiếp tục dùng danh sách grant trực tiếp, người xem mở mục để đọc mô tả.

## Đã chia sẻ

Danh sách theo quyền cấp trực tiếp, với bộ lọc loại và trạng thái ở URL. Các mục còn hạn hoặc hết hạn cho mở tài nguyên, gia hạn và thu hồi theo tài khoản. QR được tạo tại trình duyệt từ cùng URL dùng cho nút sao chép. URL giữ luồng đăng nhập và dùng quyền hiện hành khi mở. Sau thao tác, làm mới danh sách và giữ focus hợp lý. Thử giờ hết hạn, bộ lọc, phân trang, điều hướng và dialog qua Playwright.

## Quyền chỉnh sửa được chia sẻ

Hộp thoại chia sẻ cho chủ chọn **Chỉ xem** hoặc **Chỉnh sửa** khi cấp quyền. Hiển thị mức quyền cùng hạn thực tế trong danh sách đã cấp. Màn hình nhận quyền dùng vai trò do backend trả về để mở đúng thao tác. Người sửa tệp dùng nút sửa tên, mô tả và thẻ trên chi tiết. Trong thư mục được sửa, hiển thị tải lên và sửa mô tả, cùng tài khoản chịu quota. Các thao tác riêng của chủ giữ điều kiện sở hữu.

## Tài khoản và quản trị

Tài khoản hiển thị hồ sơ, số byte đang tính, hạn mức và dung lượng trong Thùng rác. Đổi mật khẩu chấm dứt phiên và dẫn về đăng nhập. Link mời và đặt lại mật khẩu mở biểu mẫu dùng một lần. Dữ liệu token nằm trong fragment khi mở, được giữ trong bộ nhớ của màn hình đến khi hoàn tất và gửi trong POST.

Màn quản trị dùng vai trò từ phiên và API. Các tab liệt kê tài khoản, lời mời và nhật ký có phân trang theo URL. Thao tác cấp, khóa, đổi quota, thay vai trò hoặc thu hồi giữ số liệu do backend trả về. Link mời và reset chỉ xuất hiện ở kết quả cấp tương ứng, với nút sao chép. Thử bàn phím, trạng thái lỗi, quyền và giữ nội dung nhập khi lưu thất bại.

## Board công khai và Khám phá

Chủ quản lý board và từng tệp trong khu vực đã đăng nhập. Màn có trạng thái nháp, công bố qua link hoặc Khám phá. Hiển thị link riêng khi board đang công bố, trạng thái ẩn do kiểm duyệt, và điều khiển riêng cho công bố mục, tải bản gốc, thứ tự và gỡ tệp. Khách mở trang công khai qua link hoặc từ danh mục Khám phá và chỉ thấy mục đang được công bố. Hiển thị đoạn văn bản dẫn xuất khi API báo hỗ trợ, và nút tải gốc theo từng mục. Kiểm tra lỗi mất công bố, bàn phím, focus, phân trang và tên dài trên desktop/mobile.

## Phạm vi PWA

Baseline ưu tiên trải nghiệm responsive. Khi bổ sung chế độ cài đặt, kiểm tra `100dvh`, safe area, nút quay lại từ deep link, input mobile tối thiểu 16 px, màn hình offline và thông báo cập nhật. Service worker chỉ được lưu tài nguyên công khai đã chọn. Tệp riêng, preview riêng và API xác thực nằm ngoài cache service worker. Chạy kiểm thử WebKit và kiểm tra standalone trên iOS trước khi phát hành PWA.
