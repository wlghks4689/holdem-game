# itch.io 정적 빌드 스크립트
# API 라우트 파일을 임시 삭제하고, 빌드 후 복원합니다.
# (Turbopack은 route 세그먼트 config를 AST 수준에서 정적 분석하므로
#  스텁 교체가 아닌 파일 삭제 방식을 사용합니다)
#
# 변경 사항:
#   - assetPrefix "./" → ./_next/... 상대경로 생성
#   - HTML 포스트 처리: favicon 및 인라인 RSC 페이로드 절대경로 수정
#   - Next.js 절대 라우트 링크를 정적 HTML 파일로 연결하는 itch 내비게이션 추가
#   - 빌드 완료 후 itch-build.zip 자동 생성
#
# 사용법: npm run build:itch

param()
$ErrorActionPreference = "Stop"

$root = $PSScriptRoot | Split-Path -Parent
Set-Location $root

# ── 삭제 대상 파일 목록 ─────────────────────────────────────────────────────────
$routeFiles = @(
    "src\app\api\feedback\route.ts",
    "src\app\api\public-rooms\route.ts",
    "src\app\api\room\create\route.ts",
    "src\app\api\room\[roomId]\route.ts",
    "src\app\api\room\[roomId]\action\route.ts",
    "src\app\api\room\[roomId]\join\route.ts",
    "src\app\api\room\[roomId]\leave\route.ts",
    "src\app\api\room\[roomId]\pause\route.ts",
    "src\app\api\room\[roomId]\rematch\route.ts",
    "src\app\api\room\[roomId]\status\route.ts",
    "src\app\holdem\rooms\page.tsx",
    "src\app\holdem\room\[roomId]\page.tsx"
)

Write-Host ""
Write-Host "=== itch.io Static Build ===" -ForegroundColor Cyan
Write-Host "Root: $root"
Write-Host ""

$backups = @{}

try {
    # ── Step 1: API route 파일 임시 삭제 ────────────────────────────────────────
    Write-Host "[ 1 / 4 ] Removing API route files..." -ForegroundColor DarkGray
    foreach ($rel in $routeFiles) {
        $path = Join-Path $root $rel
        if (Test-Path -LiteralPath $path) {
            $backups[$rel] = [System.IO.File]::ReadAllText($path)
            Remove-Item -LiteralPath $path -Force
            Write-Host "  removed: $rel" -ForegroundColor DarkGray
        } else {
            Write-Host "  skip (not found): $rel" -ForegroundColor Yellow
        }
    }

    # ── Step 2: next build ───────────────────────────────────────────────────────
    Write-Host ""
    Write-Host "[ 2 / 4 ] Running next build (output:export, assetPrefix:./)..." -ForegroundColor DarkGray
    if (Test-Path -LiteralPath ".next") {
        Remove-Item ".next" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Cleared .next cache" -ForegroundColor DarkGray
    }
    Write-Host ""
    $env:STATIC_EXPORT             = "1"
    $env:NEXT_PUBLIC_STATIC_EXPORT = "1"

    npm run build
    if ($LASTEXITCODE -ne 0) { throw "next build failed (exit $LASTEXITCODE)" }

    # ── Step 3: HTML 포스트 처리 ──────────────────────────────────────────────────
    # assetPrefix "./" 는 <link href> / <script src> 는 고쳐주지만,
    # 인라인 RSC JSON 페이로드 안의 "/_next/" 와 public 폴더 /favicon.ico 는
    # 그대로 절대경로로 남으므로 별도로 처리합니다.
    Write-Host ""
    Write-Host "[ 3 / 4 ] Post-processing HTML paths for relative embedding..." -ForegroundColor DarkGray

    $outDir = Join-Path $root "out"
    Copy-Item -LiteralPath (Join-Path $root "scripts\itch-navigation.js") -Destination (Join-Path $outDir "itch-navigation.js") -Force

    Get-ChildItem $outDir -Recurse -Filter "*.html" -File | ForEach-Object {
        $file    = $_
        $content = [System.IO.File]::ReadAllText($file.FullName)

        # $outDir 기준 깊이 계산 (root = 0, holdem/*.html = 1, …)
        $relDir = $file.DirectoryName.Substring($outDir.Length).TrimStart('\').TrimStart('/')
        $depth  = if ($relDir -eq "") { 0 } else { ($relDir -split '[/\\]').Count }

        $fixed = $content

        if ($depth -eq 0) {
            # ─ root 레벨 HTML ─────────────────────────────────────────────────
            # assetPrefix 가 <link>/<script> 의 /_next/ → ./_next/ 는 처리함.
            # 인라인 JSON 안에 남은 "/_next/" 도 "./" 상대경로로 통일.
            # (?<!\.) : 이미 "./_next/" 인 경우 중복 치환 방지
            $fixed = $fixed -replace '(?<!\.)/_next/', './_next/'
            # favicon: public 폴더 자산은 assetPrefix 가 건드리지 않음
            $fixed = $fixed -replace '"/favicon\.ico', '"./favicon.ico'
            $itchNavSrc = "./itch-navigation.js"
        } else {
            # ─ 서브디렉토리 HTML (holdem/*.html 등) ───────────────────────────
            # <link>/<script> 에 assetPrefix 가 이미 "./_next/" 로 만들었지만
            # 이 파일들은 _next/ 폴더보다 한 단계 깊으므로 "../_next/" 필요.
            $up = "../" * $depth   # depth=1 → "../"

            # 1) assetPrefix 가 생성한 "./_next/" → "../_next/"
            $fixed = $fixed -replace '\./_next/', ($up + '_next/')
            # 2) 인라인 JSON 의 "/_next/" → "../_next/" (lookbehind 로 중복 방지)
            $fixed = $fixed -replace '(?<!\.)/_next/', ($up + '_next/')
            # 3) favicon
            $fixed = $fixed -replace '"/favicon\.ico', ('"' + $up + 'favicon.ico')
            $itchNavSrc = $up + "itch-navigation.js"
        }

        # Next Link는 정적 export에서도 /holdem/... 절대 경로를 생성합니다.
        # itch.io는 업로드물을 CDN 하위 경로에 호스팅하므로, 조기 로드되는
        # 내비게이션 어댑터가 링크를 실제 *.html 상대 파일로 연결합니다.
        $navTag = '<script src="' + $itchNavSrc + '"></script>'
        $fixed = $fixed -replace '<head>', ('<head>' + $navTag)

        if ($content -ne $fixed) {
            [System.IO.File]::WriteAllText($file.FullName, $fixed)
            $rel = $file.FullName.Substring($outDir.Length + 1)
            Write-Host "  patched: $rel  (depth=$depth)" -ForegroundColor DarkGray
        }
    }

    # ── Step 3.5: _next/ → na/ 로 전체 치환 ────────────────────────────────────
    # itch.io 서버는 언더스코어(_)로 시작하는 디렉토리에 403을 반환합니다.
    # HTML, JS, CSS 내의 모든 "_next/" 문자열을 "na/"로 치환한 뒤
    # 실제 디렉토리 이름도 변경합니다.
    Write-Host ""
    Write-Host "[ 3.5 / 4 ] Renaming _next/ → na/ (itch.io 403 fix)..." -ForegroundColor DarkGray

    $oldAsset = "_next"
    $newAsset = "na"

    # 1) 모든 파일(HTML/JS/CSS/JSON)에서 3단계 치환
    # A: "/_next/"(절대경로, . 없음) → "/na/"  — Next 런타임의 currentScript 경로 판별 보존
    # B: "./_next/" / "../_next/"(상대경로)  → "./na/" / "../na/"
    # C: "_next/"(매니페스트 엔트리, 앞에 / · . 없음) → "na/"
    $patchCount = 0
    Get-ChildItem $outDir -Recurse -File | ForEach-Object {
        if ($_.Extension -in @('.html', '.js', '.css', '.json', '.txt')) {
            $c = [System.IO.File]::ReadAllText($_.FullName)
            $f = $c  -replace '(?<!\.)/_next/', ('/' + $newAsset + '/')    # A
            $f = $f  -replace '\./_next/',      ('./' + $newAsset + '/')   # B
            $f = $f  -replace '(?<![./])_next/', ($newAsset + '/')         # C
            if ($c -ne $f) {
                [System.IO.File]::WriteAllText($_.FullName, $f)
                $patchCount++
            }
        }
    }
    Write-Host "  patched $patchCount file(s)" -ForegroundColor DarkGray

    # 2) 디렉토리 이름 변경
    $oldDir = Join-Path $outDir $oldAsset
    $newDir = Join-Path $outDir $newAsset
    if (Test-Path -LiteralPath $oldDir) {
        Rename-Item -LiteralPath $oldDir -NewName $newAsset -Force
        Write-Host "  renamed: $oldAsset/ → $newAsset/" -ForegroundColor DarkGray
    }

    # ── Step 4: ZIP 생성 ─────────────────────────────────────────────────────────
    Write-Host ""
    Write-Host "[ 4 / 4 ] Creating itch-build.zip..." -ForegroundColor DarkGray
    $zipPath = Join-Path $root "itch-build.zip"
    if (Test-Path -LiteralPath $zipPath) { Remove-Item $zipPath -Force }
    Push-Location $outDir
    try { Compress-Archive -Path ".\*" -DestinationPath $zipPath -Force }
    finally { Pop-Location }
    Write-Host "  Created: itch-build.zip  ($([math]::Round((Get-Item $zipPath).Length / 1MB, 1)) MB)" -ForegroundColor Green

    Write-Host ""
    Write-Host "=== Build complete! ===" -ForegroundColor Green
    Write-Host "  Static files : out/" -ForegroundColor Green
    Write-Host "  itch.io ZIP  : itch-build.zip  ← 이 파일을 업로드하세요" -ForegroundColor Green

} finally {
    $env:STATIC_EXPORT             = ""
    $env:NEXT_PUBLIC_STATIC_EXPORT = ""

    # ── Restore: 삭제했던 파일 복원 ─────────────────────────────────────────────
    Write-Host ""
    Write-Host "[ restore ] Restoring API route files..." -ForegroundColor DarkGray
    foreach ($rel in $backups.Keys) {
        $path = Join-Path $root $rel
        [System.IO.File]::WriteAllText($path, $backups[$rel])
        Write-Host "  restored: $rel" -ForegroundColor DarkGray
    }
    Write-Host "Restore complete." -ForegroundColor DarkGray
}
