# GrowRoll

온라인 멀티플레이 "굴려라 괴혼(Katamari)" 스타일 롤링 게임.

- **클라이언트**: Vite + TypeScript + Three.js + Rapier → Vercel 배포
- **서버**: Node + TypeScript + ws (Phase 2 **릴레이**) → Oracle Cloud Always Free VM (Docker)
- **모노레포**: pnpm workspaces (`@growroll/shared` 프로토콜 공유)

자세한 설계·로드맵은 [`docs/DESIGN.md`](docs/DESIGN.md), 서버 배포는 [`docs/DEPLOY-ORACLE.md`](docs/DEPLOY-ORACLE.md) 참고.

## 요구 사항
- Node.js >= 20 (권장 22+)
- pnpm (`npm install -g pnpm`)

## 설치
```bash
pnpm install
```

## 로컬 개발
```bash
# 클라이언트 + 서버 동시 실행
pnpm dev

# 개별 실행
pnpm dev:client   # http://localhost:5173
pnpm dev:server   # ws://localhost:8080
```

> **Phase 2 완료**: `pnpm dev`로 클라이언트+릴레이 서버를 동시에 실행하면 멀티플레이 가능합니다.
> 브라우저 탭 2개를 열면 같은 맵에서 서로의 덩어리를 볼 수 있습니다.

## 멀티플레이 테스트
```bash
pnpm dev
# 탭 1: http://localhost:5173
# 탭 2: http://localhost:5173 (또는 시크릿 창)
```
- HUD에 `온라인 · N명` 표시되면 연결 성공
- 서버 없이도 싱글플레이로 동작 (오프라인)
- 환경변수 `VITE_SERVER_URL=ws://your-server:8080` 로 원격 서버 지정 가능

## 조작
- 이동: `WASD` / 방향키
- 카메라: 마우스 드래그

## 스크립트
| 명령 | 설명 |
|---|---|
| `pnpm dev` | 클라이언트+서버 동시 개발 서버 |
| `pnpm build` | 전체 빌드 |
| `pnpm typecheck` | 전체 타입체크 |

## Vercel 배포 (클라이언트)
Vercel 프로젝트 설정:
- **Root Directory**: `packages/client`
- **Framework Preset**: Other (또는 Vite — `packages/client/vercel.json`이 우선)
- **Output Directory**: `dist` (기본값, 비워도 됨)

`@growroll/shared` 워크스페이스 의존성 때문에 install/build는 모노레포 루트에서 실행합니다 (`packages/client/vercel.json` 참고).

멀티플레이 연결 시 Vercel 환경변수:
```
VITE_SERVER_URL=wss://<Oracle-서버-주소>
```

## 패키지 구조
```
packages/
├─ shared/   # 프로토콜·상수 (client/server 공유)
├─ client/   # 브라우저 게임 (Three.js + Rapier)
└─ server/   # Phase 2 릴레이 서버 (ws, 상태 중계)
```
