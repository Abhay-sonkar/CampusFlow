# Checks the job queue, the worker and notifications against http://localhost:5000
# BOTH must be running:  the API (npm run dev)  and  the worker (npm run worker)
# Needs these users (password Test@1234): abhay@test.com (COLLEGE_ADMIN), cse@test.com (STUDENT, CSE, year 3),
# ece@test.com (STUDENT, ECE, year 2), staff@test.com (FACULTY)
$base = "http://localhost:5000"
$script:pass = 0
$script:fail = 0

function Login($email) {
  (Invoke-RestMethod -Method Post -Uri "$base/api/auth/login" -ContentType "application/json" -Body (@{ email = $email; password = "Test@1234" } | ConvertTo-Json)).accessToken
}
function Auth($token) { @{ Authorization = "Bearer $token" } }
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
function Js($obj) { $obj | ConvertTo-Json -Compress -Depth 6 }
$today = (Get-Date).ToUniversalTime().Date
function Tm($daysAhead, $hour, $minute = 0) { $today.AddDays($daysAhead).AddHours($hour).AddMinutes($minute).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'") }

# Background jobs finish a moment after the API answers, so we wait for the result instead of checking once
function WaitFor($seconds, $condition) {
  $until = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $until) { if (& $condition) { return $true }; Start-Sleep -Milliseconds 500 }
  return $false
}
function Expect($name, $seconds, $condition) { Report $name (WaitFor $seconds $condition) "" }
function Unread($token) { (Invoke-RestMethod -Uri "$base/api/notifications/unread-count" -Headers (Auth $token)).count }
function Notes($token) { (Invoke-RestMethod -Uri "$base/api/notifications?limit=50" -Headers (Auth $token)).items }

try { $admin = Login "abhay@test.com"; $cse = Login "cse@test.com"; $ece = Login "ece@test.com"; $staff = Login "staff@test.com" }
catch { Write-Host "Could not log in. Is the server running, and do all 4 test users exist?" -ForegroundColor Red; exit 1 }
$stamp = "zz" + (Get-Date -Format "HHmmss")

Write-Host "`n--- Queue and worker ---"
Check "students cannot see job stats" 403 GET "/api/admin/jobs/stats" $null $cse
Check "queue is ready and a worker is online" 200 GET "/api/admin/jobs/stats" $null $admin { param($j) $j.queue -eq "ready" -and $j.workerOnline -eq $true }
if (-not ($script:last.queue -eq "ready" -and $script:last.workerOnline -eq $true)) {
  Write-Host "The queue or the worker is not running. Check REDIS_URL, start the worker with 'npm run worker' in a second terminal (wait for 'Worker ready'), then run this again." -ForegroundColor Yellow
  exit 1
}

Write-Host "`n--- Notices tell their audience ---"
$c0 = Unread $cse
$e0 = Unread $ece
Check "admin creates a draft notice for CSE year 3" 201 POST "/api/notices" (Js @{ title = "Exam notice $stamp"; content = "Mid-sem exams start next week."; audience = @{ branches = @("CSE"); years = @(3) } }) $admin
$n1 = $script:last.notice._id
Start-Sleep -Seconds 2
Report "a draft notifies nobody" ((Unread $cse) -eq $c0) ""
Check "admin publishes it" 200 POST "/api/notices/$n1/publish" $null $admin
Expect "the CSE student gets an in-app notification" 15 { @(Notes $cse | Where-Object { $_.title -like "*Exam notice $stamp*" }).Count -eq 1 }
Report "unread count went up by one" ((Unread $cse) -eq ($c0 + 1)) ""
Start-Sleep -Seconds 2
Report "the ECE student (not in the audience) gets nothing" ((Unread $ece) -eq $e0) ""
Check "unpublish" 200 POST "/api/notices/$n1/unpublish" $null $admin
Check "publish again" 200 POST "/api/notices/$n1/publish" $null $admin
Start-Sleep -Seconds 4
Report "publishing twice does not duplicate it (safe to run twice)" (@(Notes $cse | Where-Object { $_.title -like "*Exam notice $stamp*" }).Count -eq 1) ""

Write-Host "`n--- The notification inbox ---"
$first = @(Notes $cse | Where-Object { $_.title -like "*Exam notice $stamp*" })[0]
Check "unread filter lists it" 200 GET "/api/notifications?unread=true" $null $cse { param($j) @($j.items | Where-Object { $_.title -like "*Exam notice $stamp*" }).Count -eq 1 }
Check "another student cannot mark it read" 404 POST "/api/notifications/$($first._id)/read" $null $ece
Check "mark it read" 200 POST "/api/notifications/$($first._id)/read" $null $cse { param($j) $null -ne $j.notification.readAt }
Report "unread count went back down" ((Unread $cse) -eq $c0) ""
Check "marking it again is harmless" 200 POST "/api/notifications/$($first._id)/read" $null $cse
Check "mark everything read" 200 POST "/api/notifications/read-all" $null $cse
Report "nothing is unread now" ((Unread $cse) -eq 0) ""
Check "the inbox needs a login" 401 GET "/api/notifications"
Check "a malformed id" 404 POST "/api/notifications/not-an-id/read" $null $cse

Write-Host "`n--- New opportunities ---"
Check "staff posts an internship for CSE students" 201 POST "/api/opportunities" (Js @{ title = "Node Internship $stamp"; description = "A backend internship using Node."; category = "INTERNSHIP"; organization = "Acme"; deadline = (Tm 9 12); eligibility = @{ branches = @("CSE") } }) $staff
$o1 = $script:last.opportunity._id
Expect "CSE students are told about it" 15 { @(Notes $cse | Where-Object { $_.title -like "New internship*$stamp*" }).Count -eq 1 }
Start-Sleep -Seconds 2
Report "ECE students are not" (@(Notes $ece | Where-Object { $_.title -like "New internship*$stamp*" }).Count -eq 0) ""

Write-Host "`n--- Complaint updates ---"
Check "admin creates a department" 201 POST "/api/departments" (Js @{ name = "IT $stamp" }) $admin
$dept = $script:last.department._id
Check "student files a complaint" 201 POST "/api/complaints" (Js @{ title = "Wifi down $stamp"; description = "The Wi-Fi in lab 3 is not working."; department = $dept }) $cse
$cid = $script:last.complaint._id
$staffId = (Invoke-RestMethod -Uri "$base/api/auth/me" -Headers (Auth $staff)).user.id
Check "admin assigns it to the staff member" 200 POST "/api/complaints/$cid/assign" (Js @{ assigneeId = $staffId }) $admin
Expect "the student is told it was assigned" 15 { @(Notes $cse | Where-Object { $_.title -like "Your complaint was assigned*$stamp*" }).Count -eq 1 }
Expect "the staff member is told it is theirs" 15 { @(Notes $staff | Where-Object { $_.title -like "New complaint assigned to you*$stamp*" }).Count -eq 1 }
Check "staff starts work" 200 POST "/api/complaints/$cid/status" (Js @{ status = "IN_PROGRESS" }) $staff
Expect "the student is told work has started" 15 { @(Notes $cse | Where-Object { $_.title -like "Work has started*$stamp*" }).Count -eq 1 }
Check "staff resolves it" 200 POST "/api/complaints/$cid/status" (Js @{ status = "RESOLVED"; note = "Router replaced" }) $staff
Expect "the student is asked to confirm" 15 { @(Notes $cse | Where-Object { $_.title -like "Your complaint was resolved*$stamp*" }).Count -eq 1 }
Check "the student confirms the fix" 200 POST "/api/complaints/$cid/confirm" $null $cse
Expect "the staff member is told it is closed" 15 { @(Notes $staff | Where-Object { $_.title -like "Complaint closed*$stamp*" }).Count -eq 1 }
Report "nobody is notified about their own action" (@(Notes $staff | Where-Object { $_.title -like "Work has started*$stamp*" }).Count -eq 0) ""

Write-Host "`n--- Booking decisions ---"
Check "admin creates a lab" 201 POST "/api/resources" (Js @{ name = "Lab $stamp"; type = "LAB" }) $admin
$rid = $script:last.resource._id
Check "student requests 10:00-11:00" 201 POST "/api/bookings" (Js @{ resource = $rid; start = (Tm 3 10); end = (Tm 3 11); purpose = "Project work" }) $cse
$b1 = $script:last.booking._id
Check "admin approves it" 200 POST "/api/bookings/$b1/approve" $null $admin
Expect "the student is told it was approved" 15 { @(Notes $cse | Where-Object { $_.title -like "Booking approved*$stamp*" }).Count -eq 1 }
Check "student requests 11:00-12:00" 201 POST "/api/bookings" (Js @{ resource = $rid; start = (Tm 3 11); end = (Tm 3 12); purpose = "Extra session" }) $cse
$b2 = $script:last.booking._id
Check "admin rejects it with a reason" 200 POST "/api/bookings/$b2/reject" (Js @{ note = "Lab is needed for an exam" }) $admin
Expect "the student is told it was rejected, with the reason" 15 { @(Notes $cse | Where-Object { $_.title -like "Booking rejected*$stamp*" -and $_.body -like "*needed for an exam*" }).Count -eq 1 }

Write-Host "`n--- Deadline reminders ---"
$soon = (Get-Date).ToUniversalTime().AddHours(20).ToString("yyyy-MM-dd'T'HH:mm:ss'Z'")
Check "staff posts a contest that closes in 20 hours" 201 POST "/api/opportunities" (Js @{ title = "Closing Contest $stamp"; description = "A contest with a very close deadline."; category = "CONTEST"; organization = "CodeClub"; deadline = $soon }) $staff
$o2 = $script:last.opportunity._id
Check "the CSE student bookmarks it" 200 POST "/api/opportunities/$o2/bookmark" $null $cse
Check "admin runs the deadline scan now (202 = accepted)" 202 POST "/api/admin/jobs/deadline-scan" $null $admin
Expect "the bookmarker gets a reminder" 15 { @(Notes $cse | Where-Object { $_.title -like "Closing within 24 hours*$stamp*" }).Count -eq 1 }
Report "someone who did not bookmark it gets none" (@(Notes $ece | Where-Object { $_.title -like "Closing within 24 hours*$stamp*" }).Count -eq 0) ""
Check "the scan runs again" 202 POST "/api/admin/jobs/deadline-scan" $null $admin
Start-Sleep -Seconds 5
Report "the reminder is not repeated" (@(Notes $cse | Where-Object { $_.title -like "Closing within 24 hours*$stamp*" }).Count -eq 1) ""

Write-Host "`n--- Clean up ---"
Check "delete the notice" 200 DELETE "/api/notices/$n1" $null $admin
Check "delete the internship" 200 DELETE "/api/opportunities/$o1" $null $admin
Check "delete the contest" 200 DELETE "/api/opportunities/$o2" $null $admin

Write-Host "`n$($script:pass) passed, $($script:fail) failed" -ForegroundColor Cyan
Write-Host "Look at the worker terminal: you should see [job done] lines and [email] lines (emails are only printed until SMTP is configured)."
