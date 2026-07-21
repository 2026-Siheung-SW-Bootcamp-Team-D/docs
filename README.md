# docs

2026 시흥 SW 부트캠프 **Team D**의 기획·검증 기록입니다.

우리가 만드는 것은 **약속 잡기 서비스**입니다.
여러 사람이 각자 출발지를 입력하면, 모두가 무리 없이 모일 수 있는 지점을 찾아 주고
그 근처에서 뭘 할지까지 함께 정하는 서비스입니다.

이 저장소에는 **서비스 코드가 없습니다.** 대신 코드를 짜기 전에 한 일들이 들어 있습니다.
서비스 개발은 에디터를 여는 것에서 시작하지 않습니다. 보통 이런 순서로 갑니다.

```
아이디어  →  기능명세서  →  "이거 진짜 되나?" 확인(PoC)  →  API 설계  →  구현
                ↑                       │
                └─── 안 되면 명세를 고친다 ──┘
```

이 저장소는 그 왼쪽 절반의 기록입니다. **화살표가 되돌아오는 부분**을 특히 눈여겨보세요.
처음 쓴 명세서가 그대로 코드가 되는 일은 거의 없습니다.

> **PoC**(Proof of Concept)는 "이 아이디어가 실제로 가능한지 작게 만들어 확인해 보는 것"입니다.
> 집을 짓기 전에 땅을 파 보는 것과 비슷합니다.

## 어디부터 읽으면 되나

**읽기만 할 거라면** 이 순서를 권합니다.

1. [`specs/기능명세서_v1.3.md`](specs/기능명세서_v1.3.md) — 이 서비스가 무엇을 하는지. 최신 버전
2. [`api-validation/RESULTS.md`](api-validation/RESULTS.md) — 필요한 외부 API가 실제로 되는지 확인한 결과
3. [`link-poc/RESULTS.md`](link-poc/RESULTS.md) — 지도 링크·경로 표시 실험 결과
4. [`specs/API명세서_v1.1.md`](specs/API명세서_v1.1.md) — 위 내용을 바탕으로 정한 서버·앱 사이의 약속

**직접 돌려 보고 싶다면** 아래 "직접 해 보기"로 가세요.

## 폴더 구조

| 경로 | 내용 |
|---|---|
| [`specs/`](specs/) | 기능명세서·API명세서 (최신 버전) |
| [`specs/archive/`](specs/archive/) | 이전 버전 명세서와 초기 산출물 — **명세가 어떻게 변해 왔는지**의 기록 |
| [`api-validation/`](api-validation/) | 외부 API(ODsay·TMAP) 검증 코드와 결과 |
| [`link-poc/`](link-poc/) | 지도 링크 연동·경로 표시 실험 코드와 결과 |

---

# 직접 해 보기

## 준비물 (Windows 기준)

**PowerShell**을 엽니다. `시작` 버튼을 누르고 `powershell` 이라고 친 뒤 엔터를 치면 됩니다.
검은 창이 뜨는데, 여기에 명령어를 한 줄씩 입력하고 엔터를 치는 방식입니다.

| 프로그램 | 받는 곳 | 설치할 때 주의할 점 |
|---|---|---|
| **Python** | <https://www.python.org/downloads/> | ⚠️ 첫 화면 아래 **`Add python.exe to PATH` 체크박스를 꼭 켜세요** |
| **Node.js** | <https://nodejs.org/> | `LTS` 버튼으로 받고, 계속 `Next` |
| **Git** | <https://git-scm.com/download/win> | 계속 `Next` |

셋 다 설치했으면 PowerShell에서 확인합니다.

```powershell
python --version
node --version
git --version
```

버전 번호가 세 줄 나오면 준비 끝입니다.

```
Python 3.13.1
v22.11.0
git version 2.47.1.windows.1
```

> `'python'은(는) 내부 또는 외부 명령... 아닙니다` 라고 나온다면
> **PowerShell을 껐다가 다시 켜 보세요.** 설치 직후에는 인식이 안 될 때가 있습니다.
> 그래도 안 되면 `Add python.exe to PATH` 를 체크하고 다시 설치하면 됩니다.

## 내려받기

```powershell
cd ~/Documents
git clone https://github.com/2026-Siheung-SW-Bootcamp-Team-D/docs.git
cd docs
```

## API 키 준비

```powershell
copy .env.example .env
notepad .env
```

메모장이 열리면 각 줄의 `<발급받은_키를_여기에>` 를 **꺾쇠까지 통째로 지우고**
발급받은 키를 붙여 넣습니다. 키를 어디서 받는지는 파일 안 주석과 각 폴더 README에 적혀 있습니다.

> **키는 비밀번호와 같습니다.**
> `.env` 파일은 `.gitignore` 에 등록해 두어 GitHub에 올라가지 않습니다.
> 저장소에는 키 이름만 적힌 `.env.example` 만 있습니다.
>
> 만약 실수로 키를 올렸다면 **파일을 지우는 것으로는 부족합니다. 즉시 새로 발급받으세요.**
> git은 과거 기록을 전부 남기기 때문에, 지운 뒤에도 옛날 커밋에서 꺼내 볼 수 있습니다.

## 실험 실행하기

각 폴더 README에 **처음부터 끝까지 한 줄씩** 적어 두었습니다.

- [`api-validation/README.md`](api-validation/README.md) — 외부 API 호출 + 도달권 교집합 계산 (Python·Node.js, 키 필요)
- [`link-poc/README.md`](link-poc/README.md) — 지도 링크 만들기 + 경로 표시 비교 (Python, 일부는 키 없이 가능)

**키가 아직 없다면** `link-poc` 의 4단계(지도 링크 만들기)부터 해 보세요. 키 없이 바로 됩니다.

## 실행 결과 파일이 저장소에 없는 이유

스크립트를 돌리면 `results` 폴더나 `.json`·`.html` 파일이 생기는데,
이것들은 **일부러 GitHub에 올리지 않습니다.**

무엇을 알아냈는지는 `RESULTS.md` 에 글로 정리해 두었고,
원본이 필요하면 각자 키로 직접 실행해서 받으면 됩니다.

---

## 이 저장소에 없는 것

- 실제 서버·앱 코드 → 별도 저장소
- API 키 등 비밀 값 → 각자 컴퓨터의 `.env` 에만
- 외부 API 응답 원본 → 각자 실행해서 생성
