# api-validation — 외부 API가 정말 되는지 확인한 기록

기획서에 "대중교통으로 30분 안에 갈 수 있는 범위를 구해서 서로 겹치는 곳을 찾자"라고
적는 것은 쉽습니다. 문제는 **그런 API가 실제로 존재하고, 우리가 원하는 형태로 답을 주는가**입니다.

여기서는 그것을 코드를 짜기 전에 먼저 확인했습니다. 확인한 API는 5개입니다.

| 무엇을 | 어떤 API로 | 왜 필요한가 |
|---|---|---|
| 30분/60분 안에 갈 수 있는 범위 | ODsay `searchPubTransIsochrone` | 사람마다 도달 범위를 그리기 위해 |
| 그 범위들의 교집합 | Turf.js (내 컴퓨터에서 계산) | "모두가 갈 수 있는 곳"을 찾기 위해 |
| 장소 이름 → 좌표 | TMAP POI 검색 | "강남역"을 지도 위 점으로 바꾸기 위해 |
| 주소 → 좌표 | TMAP 지오코딩 | 주소만 아는 경우를 위해 |
| A에서 B까지 대중교통 경로 | TMAP 대중교통 | 소요 시간과 환승을 보여주기 위해 |

**결과 요약은 [RESULTS.md](RESULTS.md)에 있습니다. 먼저 읽어 보세요.**

## 폴더 안에 무엇이 있나

| 파일 | 설명 |
|---|---|
| `validate_apis.py` | 5개 API를 실제로 호출하고 응답을 `results/` 에 저장 |
| `intersect_poc.js` | 저장된 도달권 응답에서 교집합을 계산 (스펙 F10 검증) |
| `RESULTS.md` | 위 두 스크립트를 돌려서 알아낸 것들 |

> **응답 원본(`results/`)은 저장소에 올라가 있지 않습니다.**
> 외부 서비스에서 받아온 데이터를 공개 저장소에 그대로 올리면 약관 문제가 될 수 있어서입니다.
> 아래 순서대로 하면 **여러분 컴퓨터에 직접 만들어집니다.**

---

# 따라 하기 (Windows 기준)

처음이라면 위에서부터 순서대로 그대로 따라 하면 됩니다. 30분 정도 걸립니다.

## 0단계. 준비물 설치

### Python 설치

1. <https://www.python.org/downloads/> 접속 → 노란 **Download Python** 버튼 클릭
2. 내려받은 파일 실행
3. **⚠️ 첫 화면 맨 아래 `Add python.exe to PATH` 체크박스를 반드시 켜세요.**
   이걸 안 켜면 아래 명령어가 전부 "찾을 수 없다"고 나옵니다.
4. `Install Now` 클릭

### Node.js 설치

1. <https://nodejs.org/> 접속 → **LTS** 라고 적힌 버튼 클릭
2. 내려받은 파일 실행 → 계속 `Next` (설정 바꿀 것 없습니다)

### Git 설치

1. <https://git-scm.com/download/win> 접속 → 자동으로 다운로드 시작
2. 실행 → 계속 `Next`

### 설치 확인

**PowerShell**을 엽니다. (`시작` 버튼 → `powershell` 입력 → 엔터)

아래 세 줄을 한 줄씩 입력하고 엔터를 칩니다.

```powershell
python --version
node --version
git --version
```

이렇게 **버전 번호가 나오면 성공**입니다.

```
Python 3.13.1
v22.11.0
git version 2.47.1.windows.1
```

> 버전 숫자는 달라도 괜찮습니다. `'python'은(는) 내부 또는 외부 명령... 아닙니다` 라고
> 나오면 설치가 안 됐거나 PATH 체크를 안 한 것입니다.
> **PowerShell을 껐다 켜 보고**, 그래도 안 되면 Python을 다시 설치하면서 PATH를 체크하세요.

## 1단계. 저장소 내려받기

PowerShell에서:

```powershell
cd ~/Documents
git clone https://github.com/2026-Siheung-SW-Bootcamp-Team-D/docs.git
cd docs
```

이제 `Documents\docs` 폴더에 파일들이 생겼습니다.

## 2단계. API 키 발급받기

키는 **"내가 이 API를 쓰는 사람이다"를 증명하는 비밀번호**입니다.
사람마다 각자 발급받아야 하고, 남에게 보여 주면 안 됩니다.

### ODsay 키

1. <https://lab.odsay.com> 회원가입 → 로그인
2. `마이페이지` → `API 키 관리` → 새 키 발급
3. 나온 문자열을 복사해 둡니다

### TMAP 키

1. <https://openapi.sk.com> 회원가입 → 로그인
2. 프로젝트 생성 → `앱 키(appKey)` 복사

### 키를 파일에 넣기

```powershell
copy .env.example .env
notepad .env
```

메모장이 열리면 `<발급받은_키를_여기에>` 부분을 **꺾쇠까지 통째로 지우고** 키를 붙여 넣습니다.

```
ODSAY_API_KEY=abcd1234실제키
TMAP_APP_KEY=efgh5678실제키
```

저장(`Ctrl+S`)하고 메모장을 닫습니다.

> **`.env` 파일은 절대 GitHub에 올라가지 않습니다.** `.gitignore` 에 등록해 뒀습니다.
> 혹시라도 키를 코드나 문서에 직접 적어서 올렸다면, 파일을 지우는 것으로는 부족합니다.
> **즉시 새 키를 발급받아야 합니다** — 과거 커밋 기록에 남아 누구나 꺼내 볼 수 있기 때문입니다.

## 3단계. API 호출해 보기 (Python)

```powershell
cd api-validation
python validate_apis.py
```

**설치할 라이브러리가 없습니다.** Python에 기본으로 들어 있는 기능만 씁니다.

화면에 이런 식으로 결과가 하나씩 올라옵니다.

```
[PASS] ODsay isochrone gangnam 30min
[PASS] TMAP POI 강남역
...
```

1~2분 걸립니다. ODsay 무료 요금제는 **1초에 몇 번 이상 부르면 거절**하기 때문에
스크립트가 일부러 쉬어 가며 호출합니다. `429` 가 보여도 재시도하니 기다리면 됩니다.

끝나면 `results` 폴더가 생기고 그 안에 응답 원본 JSON 파일들이 저장됩니다.
**한번 열어 보세요.** 실제 API가 어떤 모양으로 답하는지 보는 것이 이 단계의 핵심입니다.

```powershell
notepad results\3_tmap_geocoding.json
```

## 4단계. 교집합 계산해 보기 (Node.js)

**3단계를 먼저 끝내야 합니다.** 저장된 `results` 폴더를 읽어서 계산하기 때문입니다.

```powershell
npm install
node intersect_poc.js
```

`npm install` 은 Turf.js(지도 도형 계산 라이브러리)를 내려받는 명령입니다. 처음 한 번만 하면 됩니다.

세 가지 상황을 계산해서 보여 줍니다.

| 계산 | 예상 결과 | 무슨 뜻인가 |
|---|---|---|
| 강남 60분 ∩ 정왕 60분 | 겹침 있음 | 정상적으로 중간 지점을 찾을 수 있는 경우 |
| 강남 30분 ∩ 정왕 30분 | 없을 수 있음 | 검색 시간을 늘려 줘야 하는 경우 |
| 강남 60분 ∩ 충주 60분 | 겹침 없음 | 너무 멀어서 다른 방법이 필요한 경우 |

**"겹침 없음"은 실패가 아닙니다.** 이런 경우가 실제로 생긴다는 걸 확인했기 때문에
기능명세서에 "결과가 없으면 시간·반경을 넓힌다"는 규칙을 넣을 수 있었습니다.

### 결과를 지도에서 눈으로 보기

교집합 결과는 `results\intersection_A_gangnam60_jeongwang60.geojson` 로 저장됩니다.

1. <https://geojson.io> 접속
2. 탐색기에서 그 파일을 **웹페이지 위로 끌어다 놓기**

지도 위에 "둘 다 갈 수 있는 지역"이 색칠되어 나타납니다.

---

## 자주 겪는 문제

| 화면에 나온 말 | 원인과 해결 |
|---|---|
| `'python'은(는) 내부 또는 외부 명령...` | Python 설치 때 `Add python.exe to PATH` 를 안 켬. PowerShell 재시작 → 안 되면 재설치 |
| `'npm'은(는) 내부 또는 외부 명령...` | Node.js 미설치, 또는 PowerShell 재시작 필요 |
| 키가 비었다는 오류 | `.env` 파일이 없음. 2단계의 `copy .env.example .env` 부터 다시 |
| `401` 또는 `인증 실패` | 키를 잘못 붙여 넣음. `<발급받은_키를_여기에>` 꺾쇠가 남아 있는지 확인 |
| `429 Too Many Requests` | ODsay 무료 요금제 초당 제한. 1분 기다렸다 다시 실행 |
| `geojson.features 없음` | `results` 폴더가 비어 있음. 3단계를 먼저 실행 |
| `Cannot find module '@turf/turf'` | `npm install` 을 안 함 |

## macOS · Linux를 쓴다면

명령어 두 개만 다릅니다. 나머지는 같습니다.

| Windows | macOS · Linux |
|---|---|
| `copy .env.example .env` | `cp .env.example .env` |
| `notepad .env` | `open -e .env` (또는 `nano .env`) |

`python` 명령이 없다고 나오면 `python3` 로 바꿔서 실행하세요.
