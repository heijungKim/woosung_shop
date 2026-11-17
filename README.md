# OneScape 남색(Navy) 톤 리뉴얼

원본 사이트(onescape.co.kr)의 모든 페이지·스크립트·데이터·이미지를 그대로 가져오고 색상만 남색 계열로 바꾼 버전입니다.

## 실행
    cd site
    python3 -m http.server 8000
    # 브라우저에서 http://localhost:8000/index.html

(파일을 더블클릭해서 열면 JSON 데이터 로딩이 막히므로 반드시 웹 서버로 열어야 합니다.)

## 바뀐 색상
- 포인트 컬러: 하늘색 #00a0e0 → 남색 #224291
- 녹색/회색 계열 어두운 배경 → 딥 네이비 (예: #171a18 → #0f1830 계열)
- 따뜻한 미색 배경 → 차가운 블루그레이 (예: #f7f6f2 → #f3f5f9 계열)
- 로고(logo.png, symbol.png, signature-stacked.png)의 하늘색 → 남색

## 참고
- 네이버 지도는 원본 도메인에서만 인증되므로 로컬에서는 빈칸으로 보입니다(실서버 배포 시 정상).
- about.html / contact.html은 원본에도 없는 페이지(404)라 메인의 #about / #contact로 연결했습니다.
