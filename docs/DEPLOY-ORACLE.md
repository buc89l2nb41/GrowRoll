# GrowRoll 서버 배포 가이드 — Oracle Cloud Always Free VM

GrowRoll 릴레이 게임 서버(`@growroll/server`, Phase 2 — 상태 중계 WebSocket)를 Oracle Cloud의 **영구 무료(Always Free) ARM VM** 에 Docker로 배포하는 절차입니다. 프론트엔드(Vercel)는 이 서버의 `wss://` 주소로 접속합니다.

> 요약 흐름: **VM 생성 → 포트 개방 → Docker 설치 → 이미지 빌드/실행 → HTTPS(wss) 프록시 → Vercel 연결**
>
> 사전 준비: 코드가 **GitHub 등 원격 저장소에 push** 되어 있어야 합니다 (VM에서 `git clone` 및 Vercel 연동에 필요).

---

## 1. Always Free VM 생성

1. [Oracle Cloud](https://cloud.oracle.com) 가입 (신용카드 확인 필요하나 Always Free 리소스는 과금 안 됨).
2. **Compute → Instances → Create Instance**
   - Image: **Ubuntu 22.04** (또는 24.04)
   - Shape: **Ampere (ARM) VM.Standard.A1.Flex** — Always Free 한도 내에서 예: **2 OCPU / 12GB** 선택 (최대 4 OCPU / 24GB 무료)
   - SSH 키 등록 (공개키 업로드 또는 새로 생성 후 개인키 저장)
3. 생성 후 **Public IP** 를 기록.

> 팁: ARM 용량이 부족하다는 오류가 나면 다른 가용성 도메인(AD)이나 리전을 시도하세요. 흔한 현상입니다.

---

## 2. 방화벽 / 포트 개방

두 군데 모두 열어야 합니다.

### (a) OCI 보안 목록 (Security List / NSG)
- VCN → Security List → **Ingress Rules 추가**
  - `443` (HTTPS/wss)  ← 실제 게임 접속용
  - (선택) `80` (HTTP, Let's Encrypt 인증서 발급용)

### (b) VM 내부 방화벽 (Ubuntu)
```bash
sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT
sudo netfilter-persistent save   # 재부팅 후 유지
```

---

## 3. Docker 설치

```bash
ssh ubuntu@<PUBLIC_IP>

curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 로그아웃 후 재접속하여 docker 그룹 반영
```

---

## 4. 코드 배포 & 이미지 빌드

```bash
# VM에서
git clone <YOUR_REPO_URL> growroll
cd growroll

# 레포 루트에서 빌드 (Dockerfile은 루트에 있음)
docker build -t growroll-server .

# 실행 (8080에서 서버 리슨)
docker run -d --name growroll --restart unless-stopped -p 8080:8080 growroll-server

# 로그 확인
docker logs -f growroll
# -> "GrowRoll relay server listening on ws://0.0.0.0:8080 @ 20Hz"
```

업데이트 시:
```bash
git pull && docker build -t growroll-server . \
  && docker rm -f growroll && docker run -d --name growroll --restart unless-stopped -p 8080:8080 growroll-server
```

---

## 5. HTTPS(wss) 종단 — Caddy 리버스 프록시 (권장)

브라우저가 `https://` 페이지(Vercel)에서 접속하려면 **`wss://` (TLS)** 가 필요합니다. Caddy가 도메인 인증서를 자동 발급합니다.

> 도메인이 필요합니다 (무료 예: DuckDNS 등). 도메인 A레코드를 VM Public IP로 지정하세요.

```bash
# Caddy 설치
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:
```
your-domain.example.com {
    reverse_proxy localhost:8080
}
```
Caddy는 WebSocket 업그레이드를 자동 처리합니다.

```bash
sudo systemctl restart caddy
```

이제 서버 주소는 **`wss://your-domain.example.com`** 입니다.

### 대안 — Cloudflare Tunnel (도메인·포트 개방 불필요, 더 간단)
도메인 구매나 443 포트 개방이 부담이면, Cloudflare Tunnel이 무료 TLS 하위 도메인을 자동 제공합니다.
```bash
# VM에서
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64 -o cloudflared
chmod +x cloudflared && sudo mv cloudflared /usr/local/bin/
cloudflared tunnel --url http://localhost:8080
# 출력되는 https://<random>.trycloudflare.com 이 그대로 wss:// 주소가 됨
```
- 방화벽/포트 개방(2단계) 없이 동작 (아웃바운드 연결만 사용).
- 고정 주소가 필요하면 Cloudflare 계정 + Named Tunnel로 승격.

---

## 6. 프론트엔드(Vercel) 연결

Vercel 프로젝트 환경변수:
```
VITE_SERVER_URL = wss://your-domain.example.com
```
클라이언트는 이 값으로 WebSocket에 접속합니다. (미설정 시 로컬 `ws://localhost:8080` 사용)

---

## 7. 점검 체크리스트
- [ ] `docker logs growroll` 에 listening 로그 출력
- [ ] 브라우저 콘솔에서 `wss://` 연결 성공
- [ ] 다른 네트워크의 친구가 접속 가능
- [ ] VM 재부팅 후 `--restart unless-stopped` 로 자동 기동
