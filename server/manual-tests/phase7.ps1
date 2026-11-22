# Checks Redis caching and rate limiting against http://localhost:5000
# Needs REDIS_URL in server/.env, and these users (password Test@1234):
# abhay@test.com (COLLEGE_ADMIN), cse@test.com and ece@test.com (STUDENT), staff@test.com (FACULTY)
# Run it on its own: it deliberately trips the login limit and then waits about a minute for it to reset.
$base = "http://localhost:5000"
$script:pass = 0
$script:fail = 0

function Login($email) {
  (Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType "application/json" -Body (@{ email = $email; password = "Test@1234" } | ConvertTo-Json)).accessToken
}
function Report($name, $ok, $detail) {
  if ($ok) { Write-Host "PASS  $name  $detail" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "FAIL  $name  $detail" -ForegroundColor Red; $script:fail++ }
}
# Like the earlier scripts, but it also remembers the response headers in $script:hdrs
function Check($name, $expected, $method, $path, $body = $null, $token = $null, $assert = $null) {
  $p = @{ Method = $method; Uri = "$base$path"; UseBasicParsing = $true; Headers = @{} }
  if ($token) { $p.Headers.Authorization = "Bearer $token" }
  if ($body) { $p.Body = $body; $p.ContentType = "application/json" }
  $json = $null
  $script:hdrs = $null
  try { $r = Invoke-WebRequest @p; $code = [int]$r.StatusCode; $json = $r.Content | ConvertFrom-Json; $script:hdrs = $r.Headers }
  catch { $code = [int]$_.Exception.Response.StatusCode; $script:hdrs = $_.Exception.Response.Headers }
  $script:last = $json
  $ok = ($code -eq $expected)
  $detail = "[$code] X-Cache=" + [string]$script:hdrs["X-Cache"]
  if (-not $ok) { $detail = "[got $code, expected $expected]" }
  elseif ($assert -and $json) {
    if (-not (& $assert $json)) { $ok = $false; $detail = "[$code] X-Cache=" + [string]$script:hdrs["X-Cache"] + " but the response was not what we expected" }
  }
  Report $name $ok $detail
}
function Js($obj) { $obj | ConvertTo-Json -Compress -Depth 6 }
$today = (Get-Date).ToUniversalTime().Date
function Tm($daysAhead, $hour, $minute = 0) { $today.AddDays($daysAhead).AddHours($hour).AddMinutes($minute).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'") }

Write-Host "`n--- Is Redis connected? ---"
Check "health reports Redis as ready" 200 GET "/api/health" $null $null { param($j) $j.redis -eq "ready" }
if ($script:last.redis -ne "ready") {
  Write-Host "Redis status is '$($script:last.redis)'. Put your REDIS_URL in server/.env, restart the server, and look for 'Redis connected' in its terminal." -ForegroundColor Yellow
  exit 1
}

try { $admin = Login "abhay@test.com"; $cse = Login "cse@test.com"; $ece = Login "ece@test.com"; $staff = Login "staff@test.com" }
catch { Write-Host "Could not log in. Do all 4 test users exist? (If you ran another script a moment ago, wait a minute: logins are limited to 10 per minute.)" -ForegroundColor Red; exit 1 }
$stamp = "zz" + (Get-Date -Format "HHmmss")

Write-Host "`n--- Notice feed cache ---"
Check "admin posts a notice for everyone" 201 POST "/api/notices" (Js @{ title = "Cache test $stamp"; content = "Testing the cache." }) $admin
$n1 = $script:last.notice._id
Check "admin publishes it" 200 POST "/api/notices/$n1/publish" $null $admin
Check "first read: MISS (asked MongoDB)" 200 GET "/api/notices?limit=5" $null $cse { param($j) [string]$script:hdrs["X-Cache"] -eq "MISS" }
$total1 = $script:last.pagination.total
Check "second read: HIT (served by Redis)" 200 GET "/api/notices?limit=5" $null $cse { param($j) [string]$script:hdrs["X-Cache"] -eq "HIT" -and $j.pagination.total -eq $total1 }
Check "another audience has its own entry (MISS)" 200 GET "/api/notices?limit=5" $null $ece { param($j) [string]$script:hdrs["X-Cache"] -eq "MISS" }
Check "...and then it hits too" 200 GET "/api/notices?limit=5" $null $ece { param($j) [string]$script:hdrs["X-Cache"] -eq "HIT" }
Check "a search is cached separately (MISS)" 200 GET "/api/notices?q=$stamp" $null $cse { param($j) [string]$script:hdrs["X-Cache"] -eq "MISS" -and $j.pagination.total -eq 1 }
Check "the same search again: HIT" 200 GET "/api/notices?q=$stamp" $null $cse { param($j) [string]$script:hdrs["X-Cache"] -eq "HIT" }
Check "admin posts a second notice" 201 POST "/api/notices" (Js @{ title = "Cache test two $stamp"; content = "Another one." }) $admin
$n2 = $script:last.notice._id
Check "a draft changes nothing visible, but the cache was cleared (MISS)" 200 GET "/api/notices?limit=5" $null $cse { param($j) [string]$script:hdrs["X-Cache"] -eq "MISS" -and $j.pagination.total -eq $total1 }
Check "admin publishes the second notice" 200 POST "/api/notices/$n2/publish" $null $admin
Check "no stale data: the new notice shows at once (MISS)" 200 GET "/api/notices?limit=5" $null $cse { param($j) [string]$script:hdrs["X-Cache"] -eq "MISS" -and $j.pagination.total -eq ($total1 + 1) }
Check "admin deletes the second notice" 200 DELETE "/api/notices/$n2" $null $admin
Check "deleting clears the cache too" 200 GET "/api/notices?limit=5" $null $cse { param($j) [string]$script:hdrs["X-Cache"] -eq "MISS" -and $j.pagination.total -eq $total1 }
Check "admin deletes the first notice" 200 DELETE "/api/notices/$n1" $null $admin

Write-Host "`n--- Opportunity list cache ---"
Check "staff posts an internship (CSE only)" 201 POST "/api/opportunities" (Js @{ title = "Cache Internship $stamp"; description = "A cache test internship posting."; category = "INTERNSHIP"; organization = "Acme"; deadline = (Tm 9 12); eligibility = @{ branches = @("CSE") } }) $staff
$o1 = $script:last.opportunity._id
Check "first browse: MISS" 200 GET "/api/opportunities?category=INTERNSHIP&sort=newest" $null $cse { param($j) [string]$script:hdrs["X-Cache"] -eq "MISS" -and $j.items[0].title -like "Cache Internship*" -and $j.items[0].viewer.eligible -eq $true }
$t1 = $script:last.pagination.total
Check "another student: HIT, but with their own flags" 200 GET "/api/opportunities?category=INTERNSHIP&sort=newest" $null $ece { param($j) [string]$script:hdrs["X-Cache"] -eq "HIT" -and $j.items[0].title -like "Cache Internship*" -and $j.items[0].viewer.eligible -eq $false }
Check "text searches are not cached (BYPASS)" 200 GET "/api/opportunities?q=$stamp" $null $cse { param($j) [string]$script:hdrs["X-Cache"] -eq "BYPASS" }
Check "staff posts another internship" 201 POST "/api/opportunities" (Js @{ title = "Cache Internship two $stamp"; description = "A second cache test posting."; category = "INTERNSHIP"; organization = "Acme"; deadline = (Tm 11 12) }) $staff
$o2 = $script:last.opportunity._id
Check "cache cleared, new one visible (MISS)" 200 GET "/api/opportunities?category=INTERNSHIP&sort=newest" $null $cse { param($j) [string]$script:hdrs["X-Cache"] -eq "MISS" -and $j.pagination.total -eq ($t1 + 1) }
Check "delete the first posting" 200 DELETE "/api/opportunities/$o1" $null $staff
Check "delete the second posting" 200 DELETE "/api/opportunities/$o2" $null $staff

Write-Host "`n--- Rate limiting ---"
Check "responses carry rate-limit headers" 200 GET "/api/notices?limit=1" $null $cse { param($j) [int]$script:hdrs["RateLimit-Limit"] -gt 0 }
$codes = @()
$retry = 60
for ($i = 1; $i -le 14; $i++) {
  try {
    Invoke-WebRequest -Method Post -Uri "$base/api/auth/login" -ContentType "application/json" -Body '{"email":"nobody@test.com","password":"wrong-password"}' -UseBasicParsing | Out-Null
    $codes += 200
  } catch {
    $c = [int]$_.Exception.Response.StatusCode
    $codes += $c
    if ($c -eq 429) { $h = $_.Exception.Response.Headers["Retry-After"]; if ($h) { $retry = [int]$h } }
  }
}
$first429 = [array]::IndexOf($codes, 429)
Report "wrong-password attempts: 401s first, then 429" ($first429 -gt 0 -and $first429 -le 10) "[$($codes -join ',')]"
Report "429 tells the client when to try again" ($retry -ge 1 -and $retry -le 60) "[Retry-After: $retry s]"
Check "the rest of the API still works (separate counter)" 200 GET "/api/notices?limit=1" $null $cse
Write-Host "Waiting $($retry + 1) seconds for the login limit to reset..."
Start-Sleep -Seconds ($retry + 1)
Check "login works again after the window" 200 POST "/api/auth/login" (Js @{ email = "cse@test.com"; password = "Test@1234" })

Write-Host "`n$($script:pass) passed, $($script:fail) failed" -ForegroundColor Cyan
