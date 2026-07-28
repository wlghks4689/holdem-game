# itch.io 정적 빌드 스크립트
# API 라우트 파일을 임시 삭제하고, 빌드 후 복원합니다.
# (Turbopack은 route 세그먼트 config를 AST 수준에서 정적 분석하므로
#  스텁 교체가 아닌 파일 삭제 방식을 사용합니다)
#
# 변경 사항:
#   - Next.js 공식 output:"export" 사용
#   - HTML 포스트 처리: 스크립트, CSS, favicon 및 인라인 RSC 경로를 상대경로로 수정
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
    Write-Host "[ 2 / 5 ] Running next build (output:export)..." -ForegroundColor DarkGray
    if (Test-Path -LiteralPath ".next") {
        Remove-Item ".next" -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "  Cleared .next cache" -ForegroundColor DarkGray
    }
    Write-Host ""
    $env:STATIC_EXPORT             = "1"
    $env:NEXT_PUBLIC_STATIC_EXPORT = "1"

    $npmCommand = if ($env:OS -eq "Windows_NT") { "npm.cmd" } else { "npm" }
    & $npmCommand run build
    if ($LASTEXITCODE -ne 0) { throw "next build failed (exit $LASTEXITCODE)" }

    # ── Step 3: HTML 포스트 처리 ──────────────────────────────────────────────────
    # Next.js는 <link href>, <script src>, 인라인 RSC JSON 페이로드에
    # "/_next/" 절대경로를 생성합니다. itch.io의 가변 하위 경로에서도
    # 동작하도록 HTML 파일의 깊이에 맞는 상대경로로 바꿉니다.
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

        # 모든 HTML과 인라인 RSC 모듈 맵에서 같은 "./_next/" 경로를 사용합니다.
        # 각 HTML의 <base>가 ZIP 루트를 가리키므로 서브디렉토리에서도 동일하게
        # 해석되고, Next hydration의 모듈 경로도 일치합니다.
        $fixed = $fixed -replace '(?<!\.)/_next/', './_next/'
        $fixed = $fixed -replace '"/favicon\.ico', '"./favicon.ico'

        $baseHref = if ($depth -eq 0) { "./" } else { "../" * $depth }

        # Next Link는 정적 export에서도 /holdem/... 절대 경로를 생성합니다.
        # itch.io는 업로드물을 CDN 하위 경로에 호스팅하므로, 조기 로드되는
        # 내비게이션 어댑터가 클릭 시 실제 *.html 파일로 연결합니다.
        # <base>는 반드시 Next 스크립트보다 먼저 선언되어야 합니다.
        $headTags = '<base href="' + $baseHref + '"><script src="./itch-navigation.js"></script>'
        $fixed = $fixed -replace '<head>', ('<head>' + $headTags)

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

    # ── Step 4: 정적 결과 검증 ────────────────────────────────────────────────────
    Write-Host ""
    Write-Host "[ 4 / 5 ] Validating static export..." -ForegroundColor DarkGray

    $indexPath = Join-Path $outDir "index.html"
    $assetDir = Join-Path $outDir $newAsset
    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
        throw "Static export is missing out/index.html"
    }
    if (-not (Test-Path -LiteralPath $assetDir -PathType Container)) {
        throw "Static export is missing out/$newAsset/"
    }

    $badAbsoluteResources = @()
    $missingResources = @()
    Get-ChildItem $outDir -Recurse -Filter "*.html" -File | ForEach-Object {
        $htmlFile = $_
        $html = [System.IO.File]::ReadAllText($htmlFile.FullName)
        $baseMatch = [regex]::Match($html, '<base\s+href="([^"]+)"')
        if (-not $baseMatch.Success) {
            throw "HTML is missing a project-root base URL: $($htmlFile.FullName)"
        }
        $baseHref = $baseMatch.Groups[1].Value
        $baseDirectory = [System.IO.Path]::GetFullPath(
            (Join-Path $htmlFile.DirectoryName $baseHref)
        )

        foreach ($match in [regex]::Matches($html, '(?:src|href)="([^"]+)"')) {
            $raw = $match.Groups[1].Value
            if ($raw -match '^(?:https?:|data:|mailto:|javascript:|#)') { continue }
            if ($raw -eq $baseHref) { continue }

            $pathOnly = ($raw -split '[?#]', 2)[0]
            if ($pathOnly -match '^/(?:_next|na|favicon\.ico)(?:/|$)') {
                $badAbsoluteResources += "$($htmlFile.FullName): $raw"
                continue
            }

            # /holdem/...은 itch-navigation.js가 상대 *.html 경로로 바꾸는 앱 라우트입니다.
            if ($pathOnly.StartsWith("/")) { continue }
            if ([string]::IsNullOrWhiteSpace($pathOnly)) { continue }

            $candidate = [System.IO.Path]::GetFullPath(
                (Join-Path $baseDirectory $pathOnly)
            )
            if (-not (Test-Path -LiteralPath $candidate)) {
                $missingResources += "$($htmlFile.FullName): $raw"
            }
        }
    }

    if ($badAbsoluteResources.Count -gt 0) {
        throw "Absolute static resource paths remain:`n$($badAbsoluteResources -join "`n")"
    }
    if ($missingResources.Count -gt 0) {
        throw "Referenced static resources are missing:`n$($missingResources -join "`n")"
    }

    Write-Host "  index.html present" -ForegroundColor DarkGray
    Write-Host "  $newAsset/ asset directory present" -ForegroundColor DarkGray
    Write-Host "  HTML static resource paths are relative and resolve to files" -ForegroundColor DarkGray

    # ── Step 5: ZIP 생성 ─────────────────────────────────────────────────────────
    Write-Host ""
    Write-Host "[ 5 / 5 ] Creating itch-build.zip..." -ForegroundColor DarkGray
    $zipPath = Join-Path $root "itch-build.zip"
    if (Test-Path -LiteralPath $zipPath) { Remove-Item $zipPath -Force }

    # Compress-Archive는 Windows에서 ZIP 엔트리에 역슬래시를 기록할 수 있습니다.
    # itch.io가 웹 경로로 확실히 해석하도록 모든 엔트리 이름을 "/"로 생성합니다.
    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::Open(
        $zipPath,
        [System.IO.Compression.ZipArchiveMode]::Create
    )
    try {
        Get-ChildItem $outDir -Recurse -File | ForEach-Object {
            $entryName = $_.FullName.Substring($outDir.Length + 1).Replace('\', '/')
            $entry = $archive.CreateEntry(
                $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            )
            $sourceStream = [System.IO.File]::OpenRead($_.FullName)
            $entryStream = $entry.Open()
            try {
                $sourceStream.CopyTo($entryStream)
            } finally {
                $entryStream.Dispose()
                $sourceStream.Dispose()
            }
        }
    } finally {
        $archive.Dispose()
    }

    $verifyArchive = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    try {
        $entryNames = @($verifyArchive.Entries | ForEach-Object { $_.FullName })
        if ($entryNames -notcontains "index.html") {
            throw "ZIP root is missing index.html"
        }
        if ($entryNames | Where-Object { $_ -match '\\' }) {
            throw "ZIP contains non-web backslash paths"
        }
        if ($entryNames | Where-Object { $_ -match '^out/' }) {
            throw "ZIP incorrectly contains an out/ wrapper directory"
        }
        if (-not ($entryNames | Where-Object { $_ -match "^$newAsset/" })) {
            throw "ZIP is missing the $newAsset/ asset directory"
        }
    } finally {
        $verifyArchive.Dispose()
    }

    Write-Host "  Created: itch-build.zip  ($([math]::Round((Get-Item $zipPath).Length / 1MB, 1)) MB)" -ForegroundColor Green
    Write-Host "  ZIP entries use web-standard forward slashes" -ForegroundColor DarkGray

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
