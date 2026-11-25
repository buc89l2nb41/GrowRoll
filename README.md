# GrowRoll

**무엇:** 정원 소품을 굴려 붙이며 공을 키우는 브라우저 3D 롤링 게임입니다 (Three.js + Rapier, 멀티플레이 릴레이 서버 포함).

**왜:** 직접 만든 에셋 도구(PromptAssetForge, LowPolyCultivar)로 만든 소품을 실제 게임에 넣어, 도구의 결과물이 게임 안에서 그대로 돌아가는지 보여 줍니다.

**해보기:** [라이브 데모](https://grow-roll-client.vercel.app) — 열면 바로 시작합니다. `WASD`/방향키로 굴리고, 마우스 드래그로 카메라를 돌립니다.

## 소품을 만든 도구

게임에 나오는 GLB 39개(`packages/client/public/models/`)는 아래 두 도구를 거쳐 들어왔습니다.

- **[PromptAssetForge](https://github.com/buc89l2nb41/PromptAssetForge)** — 테마 → 프롬프트 → 2D 이미지 → Trellis 2로 3D GLB를 만드는 로컬 도구입니다. [`docs/ART-PROMPTS-GARDEN.md`](docs/ART-PROMPTS-GARDEN.md)의 정원 프롬프트를 이 도구의 컬렉션으로 가져와 39개 모델을 생성했습니다.
- **[LowPolyCultivar](https://github.com/buc89l2nb41/LowPolyCultivar)** — gltfpack 프리셋으로 GLB를 줄이고 원본과 비교하는 도구입니다. 이 게임의 도토리 모델로 LOD·텍스처 설정을 시험한 기록이 이 도구의 `gltfpack-lod.md`에 있습니다.

| | 생성 직후 (39개 합계) | 게임에 들어간 파일 (39개 합계) |
|---|---|---|
| 삼각형 수 | 460,865 | 99,577 |
| 파일 크기 | 88,705,204 B (약 88.7 MB) | 1,747,768 B (약 1.7 MB) |

게임 쪽 파일은 모두 gltfpack 1.2 출력(meshopt 압축 + WebP 텍스처)이며, 클라이언트에 meshopt 디코더가 들어 있습니다.

**한계:** 멀티플레이는 별도 릴레이 서버가 떠 있을 때만 다른 플레이어가 보이고, 서버가 없으면 싱글플레이로 동작합니다. 위 표의 수치는 두 폴더의 GLB를 직접 세어 낸 값입니다(생성 직후 = PromptAssetForge 출력 폴더).

## 개발 정보

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
