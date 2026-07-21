# link-poc — 지도 링크와 경로 표시를 실험한 기록

친구가 카카오맵에서 "이 가게 어때?" 하고 링크를 보내옵니다.
그 링크 하나로 우리 서비스가 **가게 이름과 좌표를 알아낼 수 있을까요?**
반대로 우리가 고른 장소를 **카카오맵·네이버 지도에서 바로 열게 할 수 있을까요?**

여기서는 그 두 방향을 모두 실험했습니다. 그리고 실험 끝에 **방향이 한 번 바뀌었습니다.**

> 처음에는 공유 링크를 따라가서 장소 정보를 가져오는 방식을 시도했습니다.
> 하지만 링크 단축·리다이렉트에 기대는 방식은 상대 서비스가 조금만 바뀌어도 깨졌습니다.
> 그래서 최종적으로 **Kakao Local 공식 검색 API만 쓰는 쪽**으로 정리했습니다.
>
> 채택되지 않은 실험(`link_poc.py`)도 지우지 않고 남겨 두었습니다.
> **왜 그 결정을 했는지가 결과만큼 중요하기 때문입니다.**

**결과 요약은 [RESULTS.md](RESULTS.md)에 있습니다. 먼저 읽어 보세요.**

## 폴더 안에 무엇이 있나

| 파일 | 무엇을 하나 | 상태 |
|---|---|---|
| `kakao_local_poc.py` | Kakao Local 공식 검색 API로 장소를 찾음 | **채택된 방식** |
| `outbound_links.py` | 좌표+이름으로 카카오맵·네이버 지도 링크를 만듦 | **채택된 방식** |
| `route_display_poc.py` | 경로를 "글로 요약" vs "지도에 선 그리기" 두 안으로 비교 | 비교 실험 |
| `link_poc.py` | 공유 링크를 따라가 장소 정보를 추출 | 참고용 (미채택) |
| `RESULTS.md` | 위 실험들로 알아낸 것들 |  |

> **실행 결과 파일(`results*.json`, `*.html`)은 저장소에 올라가 있지 않습니다.**
> 외부 서비스에서 받아온 데이터를 공개 저장소에 그대로 올리면 약관 문제가 될 수 있어서입니다.
> 아래 순서대로 하면 **여러분 컴퓨터에 직접 만들어집니다.**

---

# 따라 하기 (Windows 기준)

## 0단계. 준비물 설치

**필요한 것은 Python 하나뿐입니다.** (여기서는 Node.js가 필요 없습니다.)

1. <https://www.python.org/downloads/> 접속 → 노란 **Download Python** 버튼 클릭
2. 내려받은 파일 실행
3. **⚠️ 첫 화면 맨 아래 `Add python.exe to PATH` 체크박스를 반드시 켜세요.**
4. `Install Now` 클릭

저장소를 아직 안 받았다면 Git도 필요합니다 → <https://git-scm.com/download/win>

### 설치 확인

**PowerShell**을 엽니다. (`시작` 버튼 → `powershell` 입력 → 엔터)

```powershell
python --version
```

`Python 3.13.1` 처럼 **버전이 나오면 성공**입니다.
`'python'은(는) 내부 또는 외부 명령... 아닙니다` 가 나오면 PowerShell을 껐다 켜 보고,
그래도 안 되면 PATH 체크를 켜고 다시 설치하세요.

## 1단계. 저장소 내려받기

```powershell
cd ~/Documents
git clone https://github.com/2026-Siheung-SW-Bootcamp-Team-D/docs.git
cd docs
```

## 2단계. 카카오 키 발급받기

**아래 3개 실험 중 1번만 키가 필요합니다.** 2번·3번은 키 없이 바로 됩니다.
급하면 2번부터 해도 좋습니다.

1. <https://developers.kakao.com> 회원가입 → 로그인
2. `내 애플리케이션` → `애플리케이션 추가하기` (이름은 아무거나)
3. 만든 앱 클릭 → 왼쪽 메뉴 `앱 키`
4. **`REST API 키`** 를 복사합니다

> ⚠️ 키가 네 종류(네이티브 앱/JavaScript/REST API/Admin) 보입니다.
> **반드시 `REST API 키`** 여야 합니다. JavaScript 키를 넣으면 `401` 오류가 납니다.
> 가장 흔한 실수입니다.

### 키를 파일에 넣기

```powershell
copy .env.example .env
notepad .env
```

메모장에서 `KAKAO_REST_KEY=` 뒤의 `<발급받은_키를_여기에>` 를 **꺾쇠까지 지우고** 붙여 넣습니다.

```
KAKAO_REST_KEY=abcd1234실제키
```

저장(`Ctrl+S`) 후 닫습니다. 이 파일은 GitHub에 올라가지 않습니다.

## 3단계. 실험 1 — 카카오 장소 검색 (키 필요)

```powershell
cd link-poc
python kakao_local_poc.py
```

"카페", "정왕역 근처 밥집" 같은 키워드로 실제 검색하고,
결과를 `results-kakao.json` 에 저장합니다.

**확인해 볼 것**: 검색 결과에 좌표(`x`, `y`)와 주소가 같이 들어 있나요?
들어 있다면 "장소를 고르면 지도에 바로 찍을 수 있다"는 기획이 성립합니다.

```powershell
notepad results-kakao.json
```

## 4단계. 실험 2 — 지도 링크 만들기 (키 불필요)

```powershell
python outbound_links.py
```

좌표와 장소 이름만으로 이런 링크들을 만들어 냅니다.

- 카카오맵: 장소 보기 / 길찾기 / 주변 검색
- 네이버 지도: 앱으로 열기 + 웹으로 열기

실행하면 `test-outbound.html` 파일이 생깁니다. **직접 눌러 보는 것이 이 실험의 전부입니다.**

```powershell
start test-outbound.html
```

브라우저가 열리면서 링크 목록이 나옵니다.

- **PC에서**: 링크를 누르면 카카오맵·네이버 지도 웹사이트가 열려야 합니다
- **휴대폰에서**: 앱이 설치돼 있으면 **앱이 바로 실행**돼야 합니다

> 휴대폰에서 확인하려면 이 HTML 파일을 카톡으로 자기 자신에게 보내서 열면 됩니다.
>
> **핵심 발견**: 카카오에서 가져온 장소도 네이버 지도에서 열립니다.
> 링크를 "좌표 + 이름"으로 만들기 때문에, 어느 지도 앱을 쓰든 상관없습니다.
> 사용자가 각자 좋아하는 앱을 쓰게 해 줄 수 있다는 뜻입니다.

## 5단계. 실험 3 — 경로를 어떻게 보여 줄까 (키 불필요)

**⚠️ 이 실험만 다른 폴더의 결과가 먼저 필요합니다.**
`api-validation` 의 [README](../api-validation/README.md) 3단계(`validate_apis.py`)를 먼저 끝내세요.
TMAP 경로 응답을 재료로 쓰기 때문입니다.

```powershell
python route_display_poc.py
start route-display.html
```

같은 경로를 **두 가지 방식으로** 보여 주고, 버튼으로 전환할 수 있습니다.

| | 보여 주는 것 | 장점 | 단점 |
|---|---|---|---|
| **A안** | "42분, 환승 1회, 1,450원, 지하철" | 한눈에 들어옴, 만들기 쉬움 | 어디를 지나는지 모름 |
| **B안** | 지도 위에 노선을 색깔 선으로 | 경로가 직관적 | 만들기 복잡, 화면 차지 |

지하철은 파랑, 버스는 초록처럼 수단마다 색이 다르고, 걷는 구간은 선 없이 글로만 나옵니다.

**둘을 번갈아 보면서 "우리 서비스에는 어느 쪽이 맞을까"를 정하는 것**이 이 실험의 목적입니다.
정답은 없습니다. 눈으로 비교해 보고 팀에서 결정하면 됩니다.

---

## 자주 겪는 문제

| 화면에 나온 말 | 원인과 해결 |
|---|---|
| `'python'은(는) 내부 또는 외부 명령...` | 설치 때 `Add python.exe to PATH` 를 안 켬. PowerShell 재시작 → 안 되면 재설치 |
| 키가 비었다는 오류 | `.env` 파일이 없음. `copy .env.example .env` 부터 다시 |
| 카카오 API가 `401` | **JavaScript 키를 넣었을 가능성이 높습니다.** `REST API 키` 로 바꾸세요 |
| `route_display_poc.py` 에서 파일 없음 | `api-validation/validate_apis.py` 를 먼저 실행 |
| HTML에서 링크를 눌러도 앱이 안 열림 | 앱 링크는 그 앱이 깔린 휴대폰에서만 동작합니다. PC에서는 웹 링크로 확인하세요 |
| `start` 명령이 안 먹힘 | 탐색기에서 해당 폴더를 열고 HTML 파일을 더블클릭해도 됩니다 |

## macOS · Linux를 쓴다면

명령어 세 개만 다릅니다.

| Windows | macOS · Linux |
|---|---|
| `copy .env.example .env` | `cp .env.example .env` |
| `notepad .env` | `open -e .env` (또는 `nano .env`) |
| `start 파일.html` | `open 파일.html` (Linux는 `xdg-open`) |

`python` 명령이 없다고 나오면 `python3` 로 바꿔서 실행하세요.
