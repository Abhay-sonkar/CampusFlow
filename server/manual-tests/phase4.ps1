# Runs the whole complaint workflow against http://localhost:5000
# Needs these users (password Test@1234): abhay@test.com (COLLEGE_ADMIN), cse@test.com, ece@test.com (STUDENT), staff@test.com (FACULTY)
$base = "http://localhost:5000"
$script:pass = 0
$script:fail = 0

function Login($email) {
  (Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType "application/json" -Body (@{ email = $email; password = "Test@1234" } | ConvertTo-Json)).accessToken
}
function MeId($token) {
  (Invoke-RestMethod -Uri "$base/api/auth/me" -Headers @{ Authorization = "Bearer $token" }).user.id
}
function Report($name, $ok, $detail) {
  if ($ok) { Write-Host "PASS  $name  $detail" -ForegroundColor Green; $script:pass++ }
  else { Write-Host "FAIL  $name  $detail" -ForegroundColor Red; $script:fail++ }
}
function Check($name, $expected, $method, $path, $body = $null, $token = $null, $assert = $null) {
  $p = @{ Method = $method; Uri = "$base$path"; UseBasicParsing = $true; Headers = @{} }
  if ($token) { $p.Headers.Authorization = "Bearer $token" }
  if ($body) { $p.Body = $body; $p.ContentType = "application/json" }
  $json = $null
  try { $r = Invoke-WebRequest @p; $code = [int]$r.StatusCode; $json = $r.Content | ConvertFrom-Json }
  catch { $code = [int]$_.Exception.Response.StatusCode }
  $script:last = $json
  $ok = ($code -eq $expected)
  $detail = "[$code]"
  if (-not $ok) { $detail = "[got $code, expected $expected]" }
  elseif ($assert -and $json) {
    if (-not (& $assert $json)) { $ok = $false; $detail = "[$code] but the response was not what we expected" }
  }
  Report $name $ok $detail
}
function CheckUpload($name, $expected, $path, $token, $file, $mime) {
  $code = curl.exe -s -o NUL -w "%{http_code}" -X POST "$base$path" -H "Authorization: Bearer $token" -F "files=@$file;type=$mime"
  Report $name ([int]$code -eq $expected) "[$code]"
}

try { $admin = Login "abhay@test.com"; $cse = Login "cse@test.com"; $ece = Login "ece@test.com"; $staff = Login "staff@test.com" }
catch { Write-Host "Could not log in. Is the server running, and do all 4 test users exist?" -ForegroundColor Red; exit 1 }
$staffId = MeId $staff
$cseId = MeId $cse

# Small test files: a 1x1 PNG and a text file (should be rejected)
$png = Join-Path $env:TEMP "campusflow-evidence.png"
[IO.File]::WriteAllBytes($png, [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="))
$txt = Join-Path $env:TEMP "campusflow-bad.txt"
Set-Content -Path $txt -Value "not an image"

Write-Host "`n--- Departments ---"
$deptName = "IT Support " + (Get-Date -Format "HHmmss")
Check "admin creates department" 201 POST "/api/departments" (@{ name = $deptName; description = "Wi-Fi, labs, projectors" } | ConvertTo-Json -Compress) $admin
$deptId = $script:last.department._id
Check "duplicate name rejected" 409 POST "/api/departments" (@{ name = $deptName.ToLower() } | ConvertTo-Json -Compress) $admin
Check "student cannot create department" 403 POST "/api/departments" (@{ name = "Hack Dept" } | ConvertTo-Json -Compress) $cse
Check "anyone logged in can list departments" 200 GET "/api/departments" $null $cse { param($j) $j.departments.Count -ge 1 }

Write-Host "`n--- Filing and visibility ---"
$complaintBody = @{ title = "Wi-Fi down in Lab 3"; description = "The Wi-Fi in Lab 3 has not worked since this morning."; department = $deptId; priority = "HIGH" } | ConvertTo-Json -Compress
Check "student files a complaint" 201 POST "/api/complaints" $complaintBody $cse { param($j) $j.complaint.status -eq "OPEN" }
$cid = $script:last.complaint._id
Check "bad department id rejected" 400 POST "/api/complaints" (@{ title = "Broken fan"; description = "The fan in room 12 is broken."; department = "123" } | ConvertTo-Json -Compress) $cse
Check "owner can open it" 200 GET "/api/complaints/$cid" $null $cse
Check "other student cannot open it" 404 GET "/api/complaints/$cid" $null $ece
Check "other student's list is empty" 200 GET "/api/complaints" $null $ece { param($j) $j.pagination.total -eq 0 }
Check "owner's list has it" 200 GET "/api/complaints" $null $cse { param($j) $j.pagination.total -ge 1 }

Write-Host "`n--- Assigning ---"
Check "student cannot assign" 403 POST "/api/complaints/$cid/assign" (@{ assigneeId = $staffId } | ConvertTo-Json -Compress) $cse
Check "cannot assign to a student" 400 POST "/api/complaints/$cid/assign" (@{ assigneeId = $cseId } | ConvertTo-Json -Compress) $admin
Check "admin assigns to staff" 200 POST "/api/complaints/$cid/assign" (@{ assigneeId = $staffId; note = "Please check the access point" } | ConvertTo-Json -Compress) $admin { param($j) $j.complaint.status -eq "ASSIGNED" }
Check "staff sees assigned complaint" 200 GET "/api/complaints" $null $staff { param($j) $j.pagination.total -ge 1 }

Write-Host "`n--- Workflow rules ---"
Check "student cannot change status" 403 POST "/api/complaints/$cid/status" (@{ status = "RESOLVED" } | ConvertTo-Json -Compress) $cse
Check "cannot skip ASSIGNED -> RESOLVED" 409 POST "/api/complaints/$cid/status" (@{ status = "RESOLVED" } | ConvertTo-Json -Compress) $staff
Check "staff starts work" 200 POST "/api/complaints/$cid/status" (@{ status = "IN_PROGRESS" } | ConvertTo-Json -Compress) $staff { param($j) $j.complaint.status -eq "IN_PROGRESS" }
Check "student cannot confirm early" 409 POST "/api/complaints/$cid/confirm" $null $cse

Write-Host "`n--- Comments and evidence ---"
Check "student comments" 201 POST "/api/complaints/$cid/comments" (@{ text = "It is still down for the whole lab." } | ConvertTo-Json -Compress) $cse
Check "staff comments" 201 POST "/api/complaints/$cid/comments" (@{ text = "Replacing the router now." } | ConvertTo-Json -Compress) $staff
Check "outsider cannot comment" 404 POST "/api/complaints/$cid/comments" (@{ text = "Hello" } | ConvertTo-Json -Compress) $ece
CheckUpload "student uploads a PNG" 200 "/api/complaints/$cid/evidence" $cse $png "image/png"
CheckUpload "text file is rejected" 400 "/api/complaints/$cid/evidence" $cse $txt "text/plain"
Check "evidence was saved" 200 GET "/api/complaints/$cid" $null $cse { param($j) $j.complaint.evidence.Count -eq 1 }

Write-Host "`n--- Resolve, reopen, confirm ---"
Check "staff resolves" 200 POST "/api/complaints/$cid/status" (@{ status = "RESOLVED"; note = "Router replaced" } | ConvertTo-Json -Compress) $staff { param($j) $j.complaint.status -eq "RESOLVED" }
Check "staff cannot confirm for the student" 403 POST "/api/complaints/$cid/confirm" $null $staff
Check "reopen needs a reason" 400 POST "/api/complaints/$cid/reopen" "{}" $cse
Check "student reopens: not fixed" 200 POST "/api/complaints/$cid/reopen" (@{ note = "Still no Wi-Fi in the back row" } | ConvertTo-Json -Compress) $cse { param($j) $j.complaint.status -eq "IN_PROGRESS" }
Check "staff resolves again" 200 POST "/api/complaints/$cid/status" (@{ status = "RESOLVED" } | ConvertTo-Json -Compress) $staff
Check "student confirms" 200 POST "/api/complaints/$cid/confirm" $null $cse { param($j) $j.complaint.status -eq "CLOSED" }
Check "closed complaint rejects comments" 409 POST "/api/complaints/$cid/comments" (@{ text = "One more thing" } | ConvertTo-Json -Compress) $cse
Check "history has all 7 steps" 200 GET "/api/complaints/$cid" $null $admin { param($j) $j.complaint.history.Count -eq 7 -and $j.complaint.comments.Count -eq 2 }
Check "no token" 401 GET "/api/complaints"

Write-Host "`n$($script:pass) passed, $($script:fail) failed" -ForegroundColor Cyan
